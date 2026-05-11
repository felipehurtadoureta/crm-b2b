import {
    Building2,
    Users,
    DollarSign,
    TrendingUp,
    Phone,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    Briefcase,
    Clock3,
  } from 'lucide-react'
  
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '@/components/ui/card'
  
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from '@/components/ui/table'
  
  import { Badge } from '@/components/ui/badge'
  import { Button } from '@/components/ui/button'
  import { Separator } from '@/components/ui/separator'
  
  const kpis = [
    {
      title: 'Ventas del mes',
      value: '$48.900.000',
      change: '+18%',
      positive: true,
      icon: DollarSign,
    },
    {
      title: 'Nuevos clientes',
      value: '124',
      change: '+12%',
      positive: true,
      icon: Users,
    },
    {
      title: 'Empresas activas',
      value: '842',
      change: '+4%',
      positive: true,
      icon: Building2,
    },
    {
      title: 'Llamadas realizadas',
      value: '1.284',
      change: '-3%',
      positive: false,
      icon: Phone,
    },
  ]
  
  const pipeline = [
    {
      stage: 'Prospectos',
      value: '$12M',
      deals: 22,
    },
    {
      stage: 'Calificados',
      value: '$31M',
      deals: 18,
    },
    {
      stage: 'Propuesta enviada',
      value: '$52M',
      deals: 11,
    },
    {
      stage: 'Negociación',
      value: '$19M',
      deals: 6,
    },
  ]
  
  const activities = [
    {
      user: 'Felipe Hurtado',
      action: 'Creó nueva oportunidad',
      company: 'Constructora Andes',
      time: 'Hace 12 min',
    },
    {
      user: 'Camila Rojas',
      action: 'Registró llamada',
      company: 'Agroexport Chile',
      time: 'Hace 22 min',
    },
    {
      user: 'Martín Silva',
      action: 'Envió cotización',
      company: 'TechNova SPA',
      time: 'Hace 45 min',
    },
  ]
  
  const topDeals = [
    {
      company: 'Minera Pacific',
      owner: 'Felipe Hurtado',
      amount: '$18.000.000',
      stage: 'Negociación',
    },
    {
      company: 'Inversiones Sur',
      owner: 'Camila Rojas',
      amount: '$9.400.000',
      stage: 'Propuesta',
    },
    {
      company: 'Logística One',
      owner: 'Martín Silva',
      amount: '$7.200.000',
      stage: 'Calificado',
    },
  ]
  
  export default function DashboardExecutive() {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Dashboard Ejecutivo
            </h1>
  
            <p className="mt-1 text-muted-foreground">
              Resumen comercial y operacional del CRM
            </p>
          </div>
  
          <div className="flex items-center gap-3">
            <Button variant="outline">
              Exportar
            </Button>
  
            <Button>
              Nuevo negocio
            </Button>
          </div>
        </div>
  
        <Separator />
  
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon
  
            return (
              <Card
                key={kpi.title}
                className="border-border/50 bg-card/70 backdrop-blur-sm transition-all hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        {kpi.title}
                      </p>
  
                      <h3 className="mt-3 text-3xl font-bold tracking-tight">
                        {kpi.value}
                      </h3>
                    </div>
  
                    <div className="rounded-2xl bg-primary/10 p-3">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
  
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    {kpi.positive ? (
                      <ArrowUpRight className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4 text-red-500" />
                    )}
  
                    <span
                      className={
                        kpi.positive
                          ? 'text-green-500'
                          : 'text-red-500'
                      }
                    >
                      {kpi.change}
                    </span>
  
                    <span className="text-muted-foreground">
                      vs mes anterior
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
  
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    Pipeline comercial
                  </CardTitle>
  
                  <p className="mt-1 text-sm text-muted-foreground">
                    Estado actual de oportunidades
                  </p>
                </div>
  
                <Badge variant="secondary">
                  57 negocios activos
                </Badge>
              </div>
            </CardHeader>
  
            <CardContent className="space-y-4">
              {pipeline.map((item) => (
                <div
                  key={item.stage}
                  className="rounded-2xl border border-border/50 bg-muted/30 p-5 transition-all hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4 text-primary" />
  
                        <h3 className="font-semibold">
                          {item.stage}
                        </h3>
                      </div>
  
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.deals} oportunidades
                      </p>
                    </div>
  
                    <div className="text-right">
                      <p className="text-2xl font-bold">
                        {item.value}
                      </p>
                    </div>
                  </div>
  
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.random() * 70 + 20}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
  
          <Card>
            <CardHeader>
              <CardTitle>
                Actividad reciente
              </CardTitle>
            </CardHeader>
  
            <CardContent className="space-y-5">
              {activities.map((activity, index) => (
                <div
                  key={index}
                  className="flex gap-4"
                >
                  <div className="mt-1 rounded-full bg-primary/10 p-2">
                    <Activity className="h-4 w-4 text-primary" />
                  </div>
  
                  <div className="flex-1">
                    <p className="text-sm leading-relaxed">
                      <span className="font-semibold">
                        {activity.user}
                      </span>{' '}
                      {activity.action}{' '}
                      <span className="font-semibold">
                        {activity.company}
                      </span>
                    </p>
  
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock3 className="h-3 w-3" />
                      {activity.time}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
  
        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Top oportunidades
                </CardTitle>
  
                <Button
                  variant="ghost"
                  size="sm"
                >
                  Ver todas
                </Button>
              </div>
            </CardHeader>
  
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      Empresa
                    </TableHead>
  
                    <TableHead>
                      Responsable
                    </TableHead>
  
                    <TableHead>
                      Etapa
                    </TableHead>
  
                    <TableHead className="text-right">
                      Monto
                    </TableHead>
                  </TableRow>
                </TableHeader>
  
                <TableBody>
                  {topDeals.map((deal) => (
                    <TableRow key={deal.company}>
                      <TableCell className="font-medium">
                        {deal.company}
                      </TableCell>
  
                      <TableCell>
                        {deal.owner}
                      </TableCell>
  
                      <TableCell>
                        <Badge variant="outline">
                          {deal.stage}
                        </Badge>
                      </TableCell>
  
                      <TableCell className="text-right font-semibold">
                        {deal.amount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
  
          <Card>
            <CardHeader>
              <CardTitle>
                Indicadores rápidos
              </CardTitle>
            </CardHeader>
  
            <CardContent className="space-y-5">
              <div className="rounded-2xl border border-border/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Conversión
                  </span>
  
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
  
                <h3 className="mt-3 text-3xl font-bold">
                  28%
                </h3>
              </div>
  
              <div className="rounded-2xl border border-border/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Ticket promedio
                  </span>
  
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
  
                <h3 className="mt-3 text-3xl font-bold">
                  $4.8M
                </h3>
              </div>
  
              <div className="rounded-2xl border border-border/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Actividad diaria
                  </span>
  
                  <Activity className="h-4 w-4 text-primary" />
                </div>
  
                <h3 className="mt-3 text-3xl font-bold">
                  186
                </h3>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }