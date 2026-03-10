import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PresentationsModule } from './presentations/presentations.module';
import { UserModule } from './user/user.module';
import { OllamaModule } from './ollama/ollama/ollama.module';
import { NotesModule } from './notes/notes.module';
import { SubscriptionsModule } from './user/subscriptions/subscriptions.module'; // 👈 lo añadimos

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.URI as string),
    ScheduleModule.forRoot(),
    UserModule,
    PresentationsModule,
    OllamaModule,
    NotesModule,
    SubscriptionsModule, // 👈 importante
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
