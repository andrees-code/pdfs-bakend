import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PresentationsService } from '../../presentations/presentations.service';
import axios from 'axios';

@Injectable()
export class OllamaService {
  private openai: OpenAI;
  private readonly logger = new Logger(OllamaService.name);

  constructor(private readonly presentationsService: PresentationsService) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * La IA proporciona URLs de imágenes reales directamente
   */
  private getDefaultImage(): string {
    // Imagen predeterminada genérica cuando no hay match específico
    return 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop';
  }

  /**
   * Genera una URL de imagen real de Unsplash basada en palabras clave
   */
  private getUnsplashImage(keyword: string = 'nature'): string {
    // Usamos el API de Unsplash con búsqueda por keyword
    const encodedKeyword = encodeURIComponent(keyword);
    return `https://source.unsplash.com/featured/?${encodedKeyword}`;
  }

  /**
   * Busca una imagen real basada en descripción usando APIs
   */
  private async searchRealImage(description: string): Promise<string> {
    try {
      // Intentar con Unsplash API si hay API key
      if (process.env.UNSPLASH_API_KEY) {
        const response = await axios.get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(description)}&per_page=1&orientation=landscape`, {
          headers: {
            'Authorization': `Client-ID ${process.env.UNSPLASH_API_KEY}`
          }
        });
        if (response.data.results && response.data.results.length > 0) {
          return response.data.results[0].urls.regular;
        }
      }
    } catch (error) {
      this.logger.warn('Error buscando imagen en Unsplash API:', error.message);
    }

    // Fallback a source.unsplash.com
    return this.getUnsplashImage(description);
  }

  async chat(messages: any[], userId: string) {
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
      {
        type: 'function',
        function: { name: 'get_user_presentations', description: 'Obtiene una lista de todas las presentaciones del usuario.', parameters: { type: 'object', properties: {} } },
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
          description: 'Elimina una presentación específica.',
          parameters: { type: 'object', properties: { presentationId: { type: 'string' } }, required: ['presentationId'] },
        },
      },
      // 🔥 HERRAMIENTAS ESPECÍFICAS PARA EDICIÓN DE PRESENTACIONES
      {
        type: 'function',
        function: {
          name: 'add_text',
          description: 'Añade un nuevo elemento de texto a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'El texto a añadir.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles (opcional).' },
              height: { type: 'number', description: 'Alto en píxeles (opcional).' },
              color: { type: 'string', description: 'Color del texto en HEX (ej: #FF0000).' },
              fontSize: { type: 'number', description: 'Tamaño de fuente en píxeles.' },
              fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800'], description: 'Peso de la fuente.' },
              fontFamily: { type: 'string', description: 'Familia de fuente (ej: Arial, Helvetica).' },
              textAlign: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Alineación del texto.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_shape',
          description: 'Añade una nueva forma geométrica a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              bgColor: { type: 'string', description: 'Color de fondo de la forma en HEX.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['bgColor'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_icon',
          description: 'Añade un nuevo icono a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              iconName: { type: 'string', description: 'Nombre del icono (ej: ph-star, ph-heart).' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              color: { type: 'string', description: 'Color del icono en HEX.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['iconName'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_image',
          description: 'Añade una imagen a la presentación actual. DEBES proporcionar una descripción de la imagen que quieres (ej: "gato jugando", "montañas nevadas", "ciudad moderna"). El sistema buscará automáticamente una imagen real de alta calidad.',
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Descripción de la imagen que quieres añadir (ej: "paisaje de montaña", "perro golden retriever", "edificios modernos").' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              fit: { type: 'string', enum: ['contain', 'cover', 'fill'], description: 'Modo de ajuste de la imagen.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_video',
          description: 'Añade un vídeo a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              src: { type: 'string', description: 'URL del vídeo.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              autoplay: { type: 'boolean', description: 'Si debe reproducirse automáticamente.' },
              loop: { type: 'boolean', description: 'Si debe repetirse en bucle.' },
              muted: { type: 'boolean', description: 'Si debe estar silenciado.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['src'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_table',
          description: 'Añade una tabla a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              headers: { type: 'array', items: { type: 'string' }, description: 'Encabezados de la tabla.' },
              rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Filas de datos.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles (opcional).' },
              color: { type: 'string', description: 'Color del texto en HEX.' },
              borderColor: { type: 'string', description: 'Color de los bordes en HEX.' },
              headerBgColor: { type: 'string', description: 'Color de fondo de los encabezados.' },
              rowBgColor1: { type: 'string', description: 'Color de fondo de filas pares.' },
              rowBgColor2: { type: 'string', description: 'Color de fondo de filas impares.' },
              fontSize: { type: 'number', description: 'Tamaño de fuente.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['headers', 'rows'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_chart',
          description: 'Añade un gráfico a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              chartType: { type: 'string', enum: ['bar', 'line', 'pie', 'doughnut'], description: 'Tipo de gráfico.' },
              chartTitle: { type: 'string', description: 'Título del gráfico.' },
              chartData: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'number' }, color: { type: 'string' } } }, description: 'Datos del gráfico.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              color: { type: 'string', description: 'Color principal en HEX.' },
              bgColor: { type: 'string', description: 'Color de fondo en HEX.' },
              showValues: { type: 'boolean', description: 'Mostrar valores en el gráfico.' },
              showLegend: { type: 'boolean', description: 'Mostrar leyenda.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['chartType', 'chartData'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_qrcode',
          description: 'Añade un código QR a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              qrUrl: { type: 'string', description: 'URL que codifica el QR.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              color: { type: 'string', description: 'Color del QR en HEX.' },
              bgColor: { type: 'string', description: 'Color de fondo en HEX.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['qrUrl'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_list',
          description: 'Añade una lista a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              items: { type: 'array', items: { type: 'string' }, description: 'Elementos de la lista.' },
              listType: { type: 'string', enum: ['ul', 'ol'], description: 'Tipo de lista (ul=viñetas, ol=numerada).' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles (opcional).' },
              color: { type: 'string', description: 'Color del texto en HEX.' },
              fontSize: { type: 'number', description: 'Tamaño de fuente.' },
              fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800'], description: 'Peso de la fuente.' },
              itemSpacing: { type: 'number', description: 'Espaciado entre elementos.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['items'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_codeblock',
          description: 'Añade un bloque de código a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Código a mostrar.' },
              language: { type: 'string', description: 'Lenguaje de programación (ej: javascript, python).' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles (opcional).' },
              theme: { type: 'string', enum: ['dark', 'light'], description: 'Tema del código.' },
              fontSize: { type: 'number', description: 'Tamaño de fuente.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_link',
          description: 'Añade un botón/enlace a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Texto del botón.' },
              targetPage: { type: 'number', description: 'Página a la que enlaza.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              bgColor: { type: 'string', description: 'Color de fondo del botón.' },
              color: { type: 'string', description: 'Color del texto.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              fontSize: { type: 'number', description: 'Tamaño de fuente.' },
              fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800'], description: 'Peso de la fuente.' },
              opacity: { type: 'number', description: 'Opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Rotación en grados.' }
            },
            required: ['text', 'targetPage'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'change_background',
          description: 'Cambia el color de fondo de la diapositiva actual.',
          parameters: {
            type: 'object',
            properties: {
              bgColor: { type: 'string', description: 'Nuevo color de fondo en HEX.' }
            },
            required: ['bgColor'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_slide',
          description: 'Añade una nueva diapositiva vacía a la presentación.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_elements',
          description: 'Lista todos los elementos de la diapositiva actual con sus IDs y descripciones para poder identificarlos.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function',
        function: {
          name: 'modify_element',
          description: 'Modifica las propiedades de un elemento existente.',
          parameters: {
            type: 'object',
            properties: {
              elementId: { type: 'string', description: 'ID del elemento a modificar.' },
              content: { type: 'string', description: 'Nuevo texto (solo para elementos de texto).' },
              color: { type: 'string', description: 'Nuevo color en HEX.' },
              bgColor: { type: 'string', description: 'Nuevo color de fondo en HEX.' },
              fontSize: { type: 'number', description: 'Nuevo tamaño de fuente.' },
              fontWeight: { type: 'string', enum: ['400', '500', '600', '700', '800'], description: 'Nuevo peso de fuente.' },
              fontFamily: { type: 'string', description: 'Nueva familia de fuente.' },
              textAlign: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Nueva alineación de texto.' },
              x: { type: 'number', description: 'Nueva posición X.' },
              y: { type: 'number', description: 'Nueva posición Y.' },
              width: { type: 'number', description: 'Nuevo ancho.' },
              height: { type: 'number', description: 'Nuevo alto.' },
              opacity: { type: 'number', description: 'Nueva opacidad (0 a 1).' },
              rotation: { type: 'number', description: 'Nueva rotación en grados.' },
              borderRadius: { type: 'number', description: 'Nuevo radio de borde.' }
            },
            required: ['elementId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_element',
          description: 'Elimina un elemento específico de la presentación.',
          parameters: {
            type: 'object',
            properties: {
              elementId: { type: 'string', description: 'ID del elemento a eliminar.' }
            },
            required: ['elementId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_last_element',
          description: 'Elimina el último elemento añadido a la presentación.',
          parameters: { type: 'object', properties: {} },
        },
      },
    ];

    const systemMessage = {
      role: 'system',
      content: `Eres un asistente de diseño de presentaciones con libertad total para editar.
REGLAS CRÍTICAS:
- Cuando el usuario pida añadir texto, llama a 'add_text'.
- Cuando el usuario pida añadir formas o rectángulos, llama a 'add_shape'.
- Cuando el usuario pida añadir iconos, llama a 'add_icon'.
- Cuando el usuario pida añadir imágenes, llama a 'add_image' con una descripción detallada de la imagen que quieres (ej: "gato jugando con pelota", "montañas nevadas al atardecer", "edificios modernos de la ciudad"). El sistema buscará automáticamente una imagen real de alta calidad.
- Cuando el usuario pida añadir vídeos, llama a 'add_video'.
- Cuando el usuario pida añadir tablas, llama a 'add_table'.
- Cuando el usuario pida añadir gráficos o charts, llama a 'add_chart'.
- Cuando el usuario pida añadir códigos QR, llama a 'add_qrcode'.
- Cuando el usuario pida añadir listas, llama a 'add_list'.
- Cuando el usuario pida añadir bloques de código, llama a 'add_codeblock'.
- Cuando el usuario pida añadir botones o enlaces, llama a 'add_link'.
- Cuando el usuario pida cambiar el fondo, llama a 'change_background'.
- Cuando el usuario pida añadir una nueva diapositiva, llama a 'add_slide'.
- Cuando el usuario pida eliminar un elemento, usa 'delete_last_element' para eliminar el último añadido, o 'modify_element' con opacity: 0 para elementos específicos.
- Cuando el usuario pida modificar un elemento existente, llama a 'modify_element' (necesitas el elementId).
- Puedes hacer MÚLTIPLES llamadas a funciones en una sola respuesta para realizar ediciones complejas.
- Las acciones que ejecutas se aplicarán INMEDIATAMENTE en la interfaz del usuario.
- Para gestionar presentaciones, usa get_user_presentations, create_presentation, delete_presentation.
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
          // 🔥 ACCIONES DE EDICIÓN DE PRESENTACIONES
          if (functionName === 'add_text') {
            const action = { actionType: 'addText', ...functionArgs };
            this.logger.log(`✨ Add Text: ${functionArgs.content}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Texto añadido.' };
          }
          else if (functionName === 'add_shape') {
            const action = { actionType: 'addShape', ...functionArgs };
            this.logger.log(`✨ Add Shape: ${functionArgs.bgColor}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Forma añadida.' };
          }
          else if (functionName === 'add_icon') {
            const action = { actionType: 'addIcon', ...functionArgs };
            this.logger.log(`✨ Add Icon: ${functionArgs.iconName}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Icono añadido.' };
          }
          else if (functionName === 'change_background') {
            const action = { actionType: 'changeBackground', ...functionArgs };
            this.logger.log(`✨ Change Background: ${functionArgs.bgColor}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Fondo cambiado.' };
          }
          else if (functionName === 'add_slide') {
            const action = { actionType: 'addSlide' };
            this.logger.log(`✨ Add Slide`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Nueva diapositiva añadida.' };
          }
          else if (functionName === 'list_elements') {
            // Esta función necesita información del frontend, por ahora devolvemos una guía
            functionResult = { 
              message: "Para eliminar elementos específicos, necesito que me describas cuál quieres eliminar (ej: 'el texto rojo', 'la forma azul', 'la imagen del centro'). Luego puedo eliminarlo por descripción.",
              note: "La función list_elements requiere acceso al estado del frontend, por ahora usa descripciones para identificar elementos."
            };
          }
          else if (functionName === 'modify_element') {
            const action = { actionType: 'modifyElement', ...functionArgs };
            this.logger.log(`✨ Modify Element: ${functionArgs.elementId}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Elemento modificado.' };
          }
          else if (functionName === 'delete_element') {
            const action = { actionType: 'deleteElement', ...functionArgs };
            this.logger.log(`✨ Delete Element: ${functionArgs.elementId}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Elemento eliminado.' };
          }
          else if (functionName === 'delete_last_element') {
            const action = { actionType: 'deleteLastElement' };
            this.logger.log(`✨ Delete Last Element`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Último elemento eliminado.' };
          }
          else if (functionName === 'add_image') {
            // Buscar imagen real basada en la descripción
            const imageUrl = await this.searchRealImage(functionArgs.description || 'nature landscape');

            const action = { actionType: 'addImage', ...functionArgs, src: imageUrl };
            this.logger.log(`✨ Add Image: ${imageUrl} (from description: ${functionArgs.description})`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Imagen añadida.' };
          }
          else if (functionName === 'add_video') {
            const action = { actionType: 'addVideo', ...functionArgs };
            this.logger.log(`✨ Add Video: ${functionArgs.src}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Vídeo añadido.' };
          }
          else if (functionName === 'add_table') {
            const action = { actionType: 'addTable', ...functionArgs };
            this.logger.log(`✨ Add Table: ${functionArgs.headers?.length} columns`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Tabla añadida.' };
          }
          else if (functionName === 'add_chart') {
            const action = { actionType: 'addChart', ...functionArgs };
            this.logger.log(`✨ Add Chart: ${functionArgs.chartType}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Gráfico añadido.' };
          }
          else if (functionName === 'add_qrcode') {
            const action = { actionType: 'addQrcode', ...functionArgs };
            this.logger.log(`✨ Add QR Code: ${functionArgs.qrUrl}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Código QR añadido.' };
          }
          else if (functionName === 'add_list') {
            const action = { actionType: 'addList', ...functionArgs };
            this.logger.log(`✨ Add List: ${functionArgs.items?.length} items`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Lista añadida.' };
          }
          else if (functionName === 'add_codeblock') {
            const action = { actionType: 'addCodeblock', ...functionArgs };
            this.logger.log(`✨ Add Code Block: ${functionArgs.language}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Bloque de código añadido.' };
          }
          else if (functionName === 'add_link') {
            const action = { actionType: 'addLink', ...functionArgs };
            this.logger.log(`✨ Add Link: ${functionArgs.text} -> page ${functionArgs.targetPage}`);
            frontendActions.push(action);
            functionResult = { success: true, message: 'Enlace añadido.' };
          }
          // 🔥 ACCIONES DE GESTIÓN DE PRESENTACIONES
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