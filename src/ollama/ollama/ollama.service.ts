import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PresentationsService } from '../../presentations/presentations.service';

@Injectable()
export class OllamaService {
  private openai: OpenAI;
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly presentationsService: PresentationsService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async chat(messages: any[], userId: string) {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: { name: 'get_user_presentations', description: 'Obtiene una lista de todas las presentaciones.', parameters: { type: 'object', properties: {} } },
      },
      {
        type: 'function',
        function: {
          name: 'create_presentation',
          description: 'Crea una nueva presentación vacía para el usuario.',
          parameters: { type: 'object', properties: { title: { type: 'string' }, docType: { type: 'string', enum: ['pdf', 'blank'] } }, required: ['title'] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_presentation',
          description: 'Elimina una presentación.',
          parameters: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] },
        },
      },
      // 🔥 HERRAMIENTA MODIFICADA: actionType en lugar de type
      {
        type: 'function',
        function: {
          name: 'modify_current_slide',
          description: 'Ejecuta esta función OBLIGATORIAMENTE para modificar el lienzo actual (añadir texto, cambiar fondo, añadir formas).',
          parameters: {
            type: 'object',
            properties: {
              actionType: {
                type: 'string',
                enum: ['addText', 'changeBackground', 'addSlide', 'addShape'],
                description: 'La acción a realizar.'
              },
              content: {
                type: 'string',
                description: 'El texto exacto a añadir.'
              },
              color: {
                type: 'string',
                description: 'Color HEX (ej. #FF0000).'
              }
            },
            required: ['actionType'],
          },
        },
      }
    ];

    const systemMessage = {
      role: 'system',
      content: `Eres un asistente de diseño de presentaciones. 
REGLA CRÍTICA: Si el usuario pide añadir un texto, una forma o cambiar el color de fondo, DEBES llamar a la función 'modify_current_slide' con los parámetros correctos.
Identificador de usuario: ${userId}`
    };

    const apiMessages: any[] = [systemMessage, ...messages];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.2, // Más bajo para forzar uso de tools
    });

    let currentChoice = response.choices[0];
    let frontendAction: any = null;

    while (currentChoice.message.tool_calls && currentChoice.message.tool_calls.length > 0) {
      const toolCall = currentChoice.message.tool_calls[0];
      const functionName = (toolCall as any).function.name;
      const functionArgs = JSON.parse((toolCall as any).function.arguments);

      let functionResult: any = null;

      try {
        if (functionName === 'modify_current_slide') {
          // 🔥 AVISO EN CONSOLA DEL SERVIDOR
          this.logger.log(`¡LA IA USÓ LA HERRAMIENTA! Argumentos: ${JSON.stringify(functionArgs)}`);
          frontendAction = functionArgs;
          functionResult = { success: true, message: 'La interfaz gráfica se actualizará ahora.' };
        }
        else if (functionName === 'get_user_presentations') {
          functionResult = await this.presentationsService.findAll(userId);
        } else if (functionName === 'create_presentation') {
          functionResult = await this.presentationsService.create({
            userId, title: functionArgs.title, docType: functionArgs.docType || 'blank', baseWidth: 1280, baseHeight: 720, documentState: {}, slideConfigs: {}, pdfPageMap: {}
          });
        } else if (functionName === 'delete_presentation') {
          const pres = await this.presentationsService.findOne(functionArgs.presentationId);
          if (pres && pres.userId === userId) {
            await this.presentationsService.remove(functionArgs.presentationId);
            functionResult = { success: true, message: 'Presentación eliminada.' };
          } else {
            functionResult = { success: false, message: 'Presentación no encontrada.' };
          }
        }
      } catch (e: any) {
        functionResult = { error: e.message };
      }

      apiMessages.push(currentChoice.message);
      apiMessages.push({
        tool_call_id: toolCall.id,
        role: 'tool',
        name: functionName,
        content: JSON.stringify(functionResult),
      });

      response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        tools: tools,
      });

      currentChoice = response.choices[0];
    }

    return {
      message: { role: 'assistant', content: currentChoice.message.content || '¡Hecho!' },
      action: frontendAction
    };
  }
}