import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { ExpressAdapter } from '@nestjs/platform-express'
import * as bodyParser from 'body-parser'
import express, { Request, Response } from 'express'
import { join } from 'path'
import * as fs from 'fs'

let cachedApp: express.Express | null = null

async function createNestApp(): Promise<express.Express> {
  if (cachedApp) return cachedApp

  console.log('🚀 Inicializando aplicación NestJS...');
  console.log('📊 Entorno:', process.env.NODE_ENV);
  console.log('🔗 VERCEL:', process.env.VERCEL ? 'Sí' : 'No');

  // Verificar variables críticas
  const requiredEnvVars = ['URI', 'JWT_SECRET'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Variables de entorno faltantes:', missingVars);
    throw new Error(`Variables de entorno requeridas faltantes: ${missingVars.join(', ')}`);
  }

  console.log('✅ Variables de entorno verificadas');

  const expressApp = express()

  // Crear carpeta uploads si no existe
  const uploadsDir = join(process.cwd(), 'uploads')
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
      console.log('✅ Carpeta uploads creada:', uploadsDir)
    } else {
      console.log('✅ Carpeta uploads ya existe:', uploadsDir)
    }
  } catch (error) {
    console.error('❌ Error creando carpeta uploads:', error)
  }

  // Middleware CORS para archivos estáticos
  expressApp.use('/uploads', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
  })

  // Servir archivos estáticos (solo si la carpeta existe)
  if (fs.existsSync(uploadsDir)) {
    expressApp.use('/uploads', express.static(uploadsDir))
    console.log('✅ Middleware de archivos estáticos configurado')
  } else {
    console.warn('⚠️ Carpeta uploads no encontrada, middleware de archivos estáticos omitido')
  }

  console.log('🔧 Creando aplicación NestJS...')
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp))
  app.setGlobalPrefix('api')

  // Configuración de body parser
  app.use('/api/v1/webhooks/stripe', bodyParser.raw({ type: 'application/json' }))
  app.use(bodyParser.json({ limit: '50mb' }))
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))

  // Filtros y pipes globales
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  // Configuración CORS
  app.enableCors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'https://pdfs-interactivos.vercel.app'
      ]

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        console.warn('⚠️ Origen no permitido:', origin)
        callback(new Error('Not allowed by CORS'))
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true
  })

  console.log('✅ Aplicación NestJS inicializada correctamente')
  await app.init()
  cachedApp = expressApp
  return expressApp
}
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
  try {
    console.log('🌐 Handler Vercel llamado:', req.method, req.url);
    const app = await createNestApp();
    console.log('✅ Aplicación obtenida, procesando request...');
    app(req, res);
  } catch (error) {
    console.error('❌ Error fatal en handler Vercel:', error);
    console.error('Stack trace:', error.stack);
    
    // Respuesta de error básica
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: 'La aplicación no pudo inicializarse correctamente',
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    const app = await createNestApp()
    app.listen(3000,'0.0.0.0', () => console.log('🚀 API running on http://localhost:3000'))
  })()
}