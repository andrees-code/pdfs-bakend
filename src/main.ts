import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { ValidationPipe } from '@nestjs/common'
import { AllExceptionsFilter } from './all-exceptions.filter'
import { ExpressAdapter } from '@nestjs/platform-express'
import * as bodyParser from 'body-parser'
import express, { Request, Response } from 'express'

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

  console.log('🔧 Creando aplicación NestJS...')
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp))
  app.setGlobalPrefix('api')

  // Configuración de body parser
  app.use('/api/v1/webhooks/stripe', bodyParser.raw({ type: 'application/json' }))
  app.use(bodyParser.json({ limit: '100mb' }))
  app.use(bodyParser.urlencoded({ limit: '100mb', extended: true }))

  // Filtros y pipes globales
  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  // Configuración CORS (permitir cualquier origen dinámicamente; ideal para consumir desde el frontend Vercel)
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept,Authorization'
  });

  console.log('✅ Aplicación NestJS inicializada correctamente');
  await app.init();
  cachedApp = expressApp;
  return expressApp;
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
    const app = await createNestApp();
    app.listen(3000, '0.0.0.0', () => console.log('🚀 API running on http://localhost:3000'));
  })();
}