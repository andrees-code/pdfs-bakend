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
      // 🔥 NUEVA HERRAMIENTA PODEROSA: slide_action para modificar la presentación actual
      {
        type: 'function',
        function: {
          name: 'slide_action',
          description: 'Modifica la presentación actual con total libertad: añade texto, formas, iconos, cambia fondos, propiedades de elementos, etc.',
          parameters: {
            type: 'object',
            properties: {
              actionType: {
                type: 'string',
                enum: ['addText', 'addShape', 'addIcon', 'changeBackground', 'deleteElement', 'modifyElement', 'addSlide'],
                description: 'El tipo de acción a ejecutar.'
              },
              elementId: {
                type: 'string',
                description: 'ID del elemento a modificar (solo para deleteElement y modifyElement).'
              },
              content: {
                type: 'string',
                description: 'Texto a añadir o modificar.'
              },
              x: {
                type: 'number',
                description: 'Posición X en píxeles (por defecto centrado).'
              },
              y: {
                type: 'number',
                description: 'Posición Y en píxeles (por defecto centrado).'
              },
              width: {
                type: 'number',
                description: 'Ancho en píxeles.'
              },
              height: {
                type: 'number',
                description: 'Alto en píxeles.'
              },
              fontSize: {
                type: 'number',
                description: 'Tamaño de fuente en píxeles.'
              },
              fontWeight: {
                type: 'string',
                enum: ['400', '500', '600', '700', '800'],
                description: 'Peso de la fuente.'
              },
              fontFamily: {
                type: 'string',
                description: 'Familia de fuente (ej: Arial, Helvetica, Times New Roman).'
              },
              color: {
                type: 'string',
                description: 'Color HEX del texto o forma (ej: #FF0000).'
              },
              bgColor: {
                type: 'string',
                description: 'Color de fondo HEX (para cambiar el fondo de la diapositiva).'
              },
              textAlign: {
                type: 'string',
                enum: ['left', 'center', 'right', 'justify'],
                description: 'Alineación del texto.'
              },
              opacity: {
                type: 'number',
                description: 'Opacidad (0 a 1).'
              },
              borderRadius: {
                type: 'number',
                description: 'Radio de borde en píxeles.'
              },
              iconName: {
                type: 'string',
                description: 'Nombre del icono a añadir (ej: ph-star, ph-heart, etc).'
              },
              rotation: {
                type: 'number',
                description: 'Rotación en grados.'
              }
            },
            required: ['actionType'],
          },
        },
      }
    ];

    const systemMessage = {
      role: 'system',
      content: `Eres un asistente de diseño de presentaciones con libertad total para editar.
REGLA CRÍTICA: Cuando el usuario pide modificar la presentación (añadir texto, cambiar colores, formas, etc), DEBES llamar a 'slide_action' con los parámetros correctos.
Puedes hacer MÚLTIPLES llamadas a 'slide_action' en una sola respuesta para realizar ediciones complejas.
Las acciones que devuelves se aplicarán INMEDIATAMENTE en la interfaz del usuario.
Identificador de usuario: ${userId}`
    };

    const apiMessages: any[] = [systemMessage, ...messages];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: apiMessages,
      tools: tools,
      tool_choice: 'auto',
      temperature: 0.2,
    });

    let currentChoice = response.choices[0];
    const frontendActions: any[] = [];

    // 🔥 PROCESAMOS TODOS LOS TOOL CALLS EN UN LOOP
    while (currentChoice.message.tool_calls && currentChoice.message.tool_calls.length > 0) {
      // IMPORTANTE: Procesamos TODOS los tool_calls, no solo el primero
      const toolCallsToProcess = [...(currentChoice.message.tool_calls || [])];
      
      apiMessages.push(currentChoice.message);

      const toolResults: any[] = [];

      // Procesamos cada tool call
      for (const toolCall of toolCallsToProcess) {
        const functionName = (toolCall as any).function.name;
        const functionArgs = JSON.parse((toolCall as any).function.arguments);

        let functionResult: any = null;

        try {
          if (functionName === 'slide_action') {
            // 🔥 ACCIÓN DE DIAPOSITIVA: Guardamos para enviar al frontend
            this.logger.log(`✨ Slide Action: ${functionArgs.actionType} | Args: ${JSON.stringify(functionArgs)}`);
            frontendActions.push(functionArgs);
            functionResult = { success: true, message: 'Acción ejecutada en frontend.' };
          }
          else if (functionName === 'get_user_presentations') {
            functionResult = await this.presentationsService.findAll(userId);
          } 
          else if (functionName === 'create_presentation') {
            functionResult = await this.presentationsService.create({
              userId, 
              title: functionArgs.title, 
              docType: functionArgs.docType || 'blank', 
              baseWidth: 1280, 
              baseHeight: 720, 
              documentState: {}, 
              slideConfigs: {}, 
              pdfPageMap: {}
            });
          } 
          else if (functionName === 'delete_presentation') {
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

        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name: functionName,
          content: JSON.stringify(functionResult),
        });
      }

      // Agregamos todos los resultados al historial de mensajes
      apiMessages.push(...toolResults);

      // Si hay acciones de frontend, ya tenemos lo que necesitamos
      if (frontendActions.length > 0) {
        break;
      }

      // Si no hay acciones, seguimos pidiendo al modelo
      response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        tools: tools,
      });

      currentChoice = response.choices[0];
    }

    return {
      message: { role: 'assistant', content: currentChoice.message.content || '¡Hecho!' },
      actions: frontendActions.length > 0 ? frontendActions : []
    };
  }
}