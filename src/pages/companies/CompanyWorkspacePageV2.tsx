// Ficha empresa (v2): seguimientos comerciales, contactos, cotizaciones, facturas y documentos
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Company, Contact, Profile, Quote } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { kamAbbrOrInitials } from '@/lib/kamDisplay'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import CompanyCommercialFollowupsSection, {
  type CommercialFollowupsDocumentSync,
} from '@/components/companies/CompanyCommercialFollowupsSection'
import CompanyDocumentsSection from '@/components/companies/CompanyDocumentsSection'
import CompanyDialog from './CompanyDialog'
import ContactDialog from '@/pages/contacts/ContactDialog'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  MapPin,
  Phone,
  Pencil,
  Plus,
  User,
  Users,
} from 'lucide-react'

interface QuoteRow extends Quote {
  kam?: { full_name: string } | null
}

interface KamLink {
  kam_id: string
  is_lead: boolean
  kam?: { full_name: string; email?: string | null; display_abbr?: string | null } | null
}

const KAM_PRINCIPAL_TITLE =
  'KAM principal: responsable principal de la relación comercial con esta empresa. Los demás KAM asociados pueden colaborar sin ser el contacto prioritario.'

function listScrollClass(count: number) {
  return count > 6 ? 'max-h-[min(26rem,70vh)] overflow-y-auto overscroll-contain pr-0.5' : ''
}

function scrollToCompanySection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const FICHA_ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-100 transition-colors shrink-0'

export default function CompanyWorkspacePageV2() {
  const { companyId } = useParams<{ companyId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { profile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [kamLinks, setKamLinks] = useState<KamLink[]>([])
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const [kams, setKams] = useState<Profile[]>([])

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [datosEmpresaAbierto, setDatosEmpresaAbierto] = useState(false)

  const canEdit = profile?.role !== 'reader'

  const [followupDocumentSyncState, setFollowupDocumentSyncState] = useState<
    CommercialFollowupsDocumentSync & { revision: number }
  >({ revision: 0, destino: 'general', quoteId: null, invoiceId: null })

  const onFollowupDocumentContextChange = useCallback((ctx: CommercialFollowupsDocumentSync) => {
    setFollowupDocumentSyncState(prev => ({ ...ctx, revision: prev.revision + 1 }))
  }, [])

  const initialFollowupInvoiceId = useMemo(() => {
    const raw = (searchParams.get('cfInvoiceId') ?? searchParams.get('invoiceId') ?? '').trim()
    return raw || null
  }, [searchParams])

  const initialFollowupSiiSalesId = useMemo(() => {
    const raw = (searchParams.get('siiSalesId') ?? '').trim()
    return raw || null
  }, [searchParams])

  const initialFollowupMainTab = useMemo((): 'company' | 'quotes' | 'invoices' | null => {
    if (initialFollowupInvoiceId || initialFollowupSiiSalesId) return 'invoices'
    const raw = (searchParams.get('cfTab') ?? '').trim().toLowerCase()
    if (raw === 'quotes' || raw === 'cotizaciones' || raw === 'cotización') return 'quotes'
    if (raw === 'company' || raw === 'llamados' || raw === 'llamado') return 'company'
    return null
  }, [searchParams, initialFollowupInvoiceId, initialFollowupSiiSalesId])

  useEffect(() => {
    if (!initialFollowupInvoiceId || loading) return
    const t = window.setTimeout(() => scrollToCompanySection('seccion-seguimientos'), 200)
    return () => clearTimeout(t)
  }, [companyId, initialFollowupInvoiceId, loading])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setLoadError(null)

    const { data: co, error: coErr } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
    if (coErr || !co) {
      setLoadError(coErr?.message ?? 'No se encontró la empresa.')
      setCompany(null)
      setLoading(false)
      return
    }
    setCompany(co as Company)

    const [contactsRes, quotesRes, ckRes, companiesRes, kamsRes] = await Promise.all([
      supabase.from('contacts').select('*').eq('company_id', companyId).order('first_name', { ascending: true }),
      supabase
        .from('quotes')
        .select('*, kam:profiles(full_name)')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('company_kams')
        .select('kam_id, is_lead, kam:profiles(full_name, email, display_abbr)')
        .eq('company_id', companyId),
      supabase.from('companies').select('*').order('name'),
      supabase.from('profiles').select('*').in('role', ['kam', 'super_admin']).eq('is_active', true).order('full_name'),
    ])

    setContacts((contactsRes.data ?? []) as Contact[])
    setQuotes((quotesRes.data ?? []) as QuoteRow[])

    const profilesList = (kamsRes.data ?? []) as Profile[]
    const ckRaw = (ckRes.data ?? []) as unknown[]
    setKamLinks(
      ckRaw.map(row => {
        const r = row as { kam_id: string; is_lead: boolean; kam: unknown }
        let kam: { full_name: string; email?: string | null; display_abbr?: string | null } | null = null
        if (r.kam != null) {
          const k = Array.isArray(r.kam) ? r.kam[0] : r.kam
          if (k && typeof k === 'object' && k !== null && 'full_name' in k) {
            const o = k as { full_name: string; email?: string | null; display_abbr?: string | null }
            kam = { full_name: o.full_name, email: o.email ?? undefined, display_abbr: o.display_abbr ?? undefined }
          }
        }
        return { kam_id: r.kam_id, is_lead: r.is_lead, kam }
      }),
    )

    setAllCompanies(companiesRes.data ?? [])
    setKams(profilesList)

    setLoading(false)
  }, [companyId])

  useEffect(() => {
    void load()
  }, [load])

  const statusStyle: Record<string, string> = {
    activo: 'bg-green-100 text-green-800',
    inactivo: 'bg-gray-100 text-gray-700',
    potencial: 'bg-blue-100 text-blue-800',
  }

  if (!companyId) {
    return (
      <div className="text-sm text-gray-500">
        Falta el identificador de la empresa.
        <Button variant="link" className="px-1" onClick={() => navigate('/companies')}>
          Volver
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-400 text-sm">Cargando ficha de la empresa…</p>
      </div>
    )
  }

  if (loadError || !company) {
    return (
      <div className="max-w-lg space-y-4">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate('/companies')}>
          <ArrowLeft size={14} /> Volver a empresas
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loadError ?? 'Empresa no encontrada.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-gray-600 w-fit" onClick={() => navigate('/companies')}>
            <ArrowLeft size={14} /> Empresas
          </Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDatosEmpresaAbierto(true)}
                className="text-left hover:text-violet-800 hover:underline underline-offset-2 decoration-violet-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded"
                title="Ver datos generales de la empresa"
              >
                {company.name}
              </button>
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium capitalize', statusStyle[company.status])}>
                {company.status}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 justify-end shrink-0">
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => scrollToCompanySection('seccion-seguimientos')}>
              Seguimientos
            </button>
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => scrollToCompanySection('seccion-documentos')}>
              Documentos
            </button>
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => scrollToCompanySection('seccion-cotizaciones-lista')}>
              Cotizaciones
              <span className="tabular-nums text-gray-500">({quotes.length})</span>
            </button>
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => scrollToCompanySection('seccion-facturas-lista')}>
              Facturas
            </button>
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => scrollToCompanySection('seccion-contactos')}>
              Contactos
              <span className="tabular-nums text-gray-500">({contacts.filter(c => c.is_active).length})</span>
            </button>
            <button type="button" className={FICHA_ACTION_BTN} onClick={() => navigate(`/agenda?company=${company.id}`)}>
              <CalendarDays size={14} className="text-gray-500" /> Agenda
            </button>
          </div>
        </div>
      </div>

      <CompanyCommercialFollowupsSection
        companyId={company.id}
        contacts={contacts}
        quotes={quotes.map(q => ({ id: q.id, quote_number: q.quote_number, title: q.title, stage: q.stage }))}
        kams={kams}
        canEdit={canEdit}
        initialMainTab={initialFollowupMainTab ?? undefined}
        initialInvoiceId={initialFollowupInvoiceId}
        initialSiiSalesDocumentId={initialFollowupSiiSalesId}
        onDocumentLinkContextChange={onFollowupDocumentContextChange}
      />

      <CompanyDocumentsSection
        companyId={company.id}
        canEdit={canEdit}
        anchorId="seccion-documentos"
        density="compact"
        quotesForLink={quotes.map(q => ({ id: q.id, quote_number: q.quote_number, title: q.title }))}
        followupDocumentSync={followupDocumentSyncState}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section id="seccion-cotizaciones-lista" className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={16} className="text-gray-400" /> Cotizaciones
            </h2>
            <Link
              to="/quotes"
              state={{ openNew: true, companyId: company.id }}
              className={cn(FICHA_ACTION_BTN, !canEdit && 'pointer-events-none opacity-50')}
            >
              <Plus size={12} /> Nueva
            </Link>
          </div>
          <div className="p-4">
            {quotes.length === 0 ? (
              <p className="text-sm text-gray-400">Sin cotizaciones.</p>
            ) : (
              <ul className={cn('divide-y divide-gray-100', listScrollClass(quotes.length))}>
                {quotes.map(q => (
                  <li key={q.id} className="py-2 flex flex-wrap items-center justify-between gap-2 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{q.quote_number}</p>
                      <p className="text-xs text-gray-500">
                        {q.title ?? 'Sin título'} · {q.stage}
                      </p>
                    </div>
                    <Link to="/quotes" state={{ highlightId: q.id }} className="text-xs text-blue-600 hover:underline shrink-0">
                      Abrir
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section id="seccion-facturas-lista" className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Facturas</h2>
            <Link to="/sii" className={FICHA_ACTION_BTN}>
              Abrir SII (RCV)
            </Link>
          </div>
          <div className="p-4">
            <p className="text-xs text-gray-500 mb-3">
              La fuente de facturas para cobranza es SII (RCV Ventas).
              El seguimiento comercial de cobranza se mantiene en «Seguimiento comercial»
              y se asocia a la factura seleccionada.
            </p>
          </div>
        </section>
      </div>

      <section id="seccion-contactos" className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm scroll-mt-6">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <User size={16} className="text-gray-400" /> Contactos
          </h2>
          {canEdit && (
            <button
              type="button"
              className={FICHA_ACTION_BTN}
              onClick={() => {
                setSelectedContact(null)
                setContactDialogOpen(true)
              }}
            >
              <Plus size={12} /> Agregar
            </button>
          )}
        </div>
        <div className="p-4">
          {contacts.length === 0 ? (
            <p className="text-sm text-gray-400">Sin contactos registrados.</p>
          ) : (
            <ul
              className={cn(
                'grid grid-cols-1 gap-3 sm:grid-cols-2',
                contacts.length > 8 && 'max-h-[min(26rem,70vh)] overflow-y-auto overscroll-contain pr-0.5',
              )}
            >
              {contacts.map(ct => (
                <li key={ct.id} className="rounded-lg border border-gray-100 p-3 flex flex-col gap-2 min-h-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {ct.first_name} {ct.last_name}
                      {ct.is_primary && <span className="ml-1.5 text-[10px] uppercase text-amber-700 font-semibold">Principal</span>}
                      {!ct.is_active && <span className="ml-1.5 text-[10px] text-gray-400">(inactivo)</span>}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 break-all">
                      {ct.email ?? '—'}
                      {ct.phone ? ` · ${ct.phone}` : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 h-7 text-xs self-start"
                      onClick={() => {
                        setSelectedContact(ct)
                        setContactDialogOpen(true)
                      }}
                    >
                      Editar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <Dialog open={datosEmpresaAbierto} onOpenChange={setDatosEmpresaAbierto}>
        <DialogContent className="max-w-lg max-h-[min(90vh,40rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 size={18} className="text-gray-500 shrink-0" /> Datos generales · {company.name}
            </DialogTitle>
            <DialogDescription>RUT, ubicación, KAM asociados y notas registrales.</DialogDescription>
          </DialogHeader>
          {canEdit && (
            <div className="flex justify-end border-b border-gray-100 pb-3">
              <button type="button" className={FICHA_ACTION_BTN} onClick={() => setCompanyDialogOpen(true)}>
                <Pencil size={14} /> Editar empresa
              </button>
            </div>
          )}
          <dl className="space-y-2 text-sm pt-2">
            <div className="flex items-start gap-2">
              <Users size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-gray-400 text-xs">KAM asociados</dt>
                <dd className="text-gray-900">
                  {kamLinks.length === 0 ? (
                    <span className="text-gray-500">Sin KAM asignado</span>
                  ) : (
                    <ul className="mt-0.5 space-y-1">
                      {[...kamLinks].sort((a, b) => Number(b.is_lead) - Number(a.is_lead)).map(k => (
                        <li key={k.kam_id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-medium inline-flex flex-wrap items-center gap-x-1.5">
                            {k.kam ? (
                              <>
                                <span className="font-mono text-xs text-violet-900" title={k.kam.full_name}>
                                  {kamAbbrOrInitials(k.kam)}
                                </span>
                                <span>{k.kam.full_name}</span>
                              </>
                            ) : (
                              k.kam_id
                            )}
                          </span>
                          {k.is_lead && (
                            <span
                              className="text-[10px] font-semibold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded cursor-default"
                              title={KAM_PRINCIPAL_TITLE}
                            >
                              Principal
                            </span>
                          )}
                          {k.kam?.email && (
                            <a href={`mailto:${k.kam.email}`} className="text-xs text-blue-600 hover:underline">
                              {k.kam.email}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
              </div>
            </div>
            <div>
              <dt className="text-gray-400 text-xs">RUT</dt>
              <dd className="text-gray-900">{company.rut ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-gray-400 text-xs">Industria</dt>
              <dd className="text-gray-900">{company.industry ?? '—'}</dd>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-gray-400 text-xs">Ubicación</dt>
                <dd className="text-gray-900">{[company.address, company.city, company.country].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Phone size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div>
                <dt className="text-gray-400 text-xs">Teléfono</dt>
                <dd className="text-gray-900">{company.phone ?? '—'}</dd>
              </div>
            </div>
            {company.website && (
              <div>
                <dt className="text-gray-400 text-xs">Web</dt>
                <dd>
                  <a href={company.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">
                    {company.website}
                  </a>
                </dd>
              </div>
            )}
            {company.notes && (
              <div className="pt-2 border-t">
                <dt className="text-gray-400 text-xs mb-1">Notas</dt>
                <dd className="text-gray-700 whitespace-pre-wrap text-sm">{company.notes}</dd>
              </div>
            )}
          </dl>
        </DialogContent>
      </Dialog>
      <CompanyDialog
        open={companyDialogOpen}
        onClose={() => setCompanyDialogOpen(false)}
        company={company}
        kams={kams}
        onSaved={() => {
          setCompanyDialogOpen(false)
          void load()
        }}
      />

      <ContactDialog
        open={contactDialogOpen}
        onClose={() => {
          setContactDialogOpen(false)
          setSelectedContact(null)
        }}
        contact={selectedContact}
        companies={allCompanies}
        initialCompanyId={company.id}
        onSaved={() => {
          setContactDialogOpen(false)
          setSelectedContact(null)
          void load()
        }}
      />
    </div>
  )
}
