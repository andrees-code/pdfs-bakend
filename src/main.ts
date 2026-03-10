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

  const expressApp = express()

  // Nest sobre Express
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp))
  app.setGlobalPrefix('api')

  app.use('/api/v1/webhooks/stripe', bodyParser.raw({ type: 'application/json' }))
  app.use(bodyParser.json())

  app.useGlobalFilters(new AllExceptionsFilter())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.enableCors({ origin: true, credentials: true })

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
    app.listen(3000, () => console.log('🚀 API running on http://localhost:3000'))
  })()
}
