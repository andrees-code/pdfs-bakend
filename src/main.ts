import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { ExpressAdapter } from '@nestjs/platform-express'
import * as bodyParser from 'body-parser'
import express, { Request, Response } from 'express'
import { join } from 'path' // <-- IMPORTANTE: Añadir path

let cachedApp: express.Express | null = null

async function createNestApp(): Promise<express.Express> {
  if (cachedApp) return cachedApp

  const expressApp = express()

  // 👇 NUEVO: Middleware para forzar las cabeceras CORS en la carpeta de archivos estáticos
  // Esto debe ir ANTES de express.static para que intercepte la petición y añada los permisos
  expressApp.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // Permite que tu frontend Vue (ej. localhost:5173) acceda
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // SOLUCIÓN: Servir la carpeta "uploads" de forma estática directamente desde Express
  // Usamos process.cwd() para apuntar siempre a la raíz del proyecto
  expressApp.use('/uploads', express.static(join(process.cwd(), 'uploads')))

  // Nest sobre Express
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp))
  app.setGlobalPrefix('api')

  // Mantenemos el límite raw por defecto exclusivamente para Stripe
  app.use('/api/v1/webhooks/stripe', bodyParser.raw({ type: 'application/json' }))
  
  // Mantenemos los límites altos de momento por seguridad
  app.use(bodyParser.json({ limit: '50mb' }))
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  
  // Reforzamos las opciones CORS permitiendo todos los métodos necesarios para la API de Nest
  app.enableCors({ 
    origin: (origin, callback) => {
      // En desarrollo (localhost) y en Vercel (pdfs-interactivos.vercel.app), permite ambos
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'https://pdfs-interactivos.vercel.app'
      ]
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true 
  })

  await app.init()
  cachedApp = expressApp
  return expressApp
}

// Esta es la función que Vercel ejecuta
export default async function handler(req: Request, res: Response) {
  const app = await createNestApp()
  app(req, res)
}

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    const app = await createNestApp()
    app.listen(3000,'0.0.0.0', () => console.log('🚀 API running on http://localhost:3000'))
  })()
}