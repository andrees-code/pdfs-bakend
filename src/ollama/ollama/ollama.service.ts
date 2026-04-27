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
   * Fallback: imagen confiable usando picsum con seed determinista por keyword.
   * Siempre carga. El seed hace que la misma keyword dé la misma foto.
   */
  private getPicsumImage(keyword: string = 'photo', width = 800, height = 500): string {
    // Usamos solo los 3 primeros tokens para un seed limpio y corto
    const seed = keyword
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-') || 'photo';
    return `https://picsum.photos/seed/${seed}/${width}/${height}`;
  }

  /**
   * Busca una imagen real y content-matched usando múltiples APIs.
   * Orden de prioridad: Unsplash API → Pexels API → Picsum (fallback siempre disponible)
   */
  private async searchRealImage(description: string): Promise<string> {
    const encoded = encodeURIComponent(description);

    // 1️⃣ Unsplash API (necesita UNSPLASH_API_KEY)
    if (process.env.UNSPLASH_API_KEY) {
      try {
        const res = await axios.get(
          `https://api.unsplash.com/search/photos?query=${encoded}&per_page=1&orientation=landscape`,
          { headers: { 'Authorization': `Client-ID ${process.env.UNSPLASH_API_KEY}` }, timeout: 5000 }
        );
        const url = res.data?.results?.[0]?.urls?.regular;
        if (url) {
          this.logger.log(`🖼️ Imagen Unsplash: ${url}`);
          return url;
        }
      } catch (e) {
        this.logger.warn('Unsplash API falló:', e.message);
      }
    }

    // 2️⃣ Pexels API (necesita PEXELS_API_KEY)
    if (process.env.PEXELS_API_KEY) {
      try {
        const res = await axios.get(
          `https://api.pexels.com/v1/search?query=${encoded}&per_page=1&orientation=landscape`,
          { headers: { 'Authorization': process.env.PEXELS_API_KEY }, timeout: 5000 }
        );
        const url = res.data?.photos?.[0]?.src?.large;
        if (url) {
          this.logger.log(`🖼️ Imagen Pexels: ${url}`);
          return url;
        }
      } catch (e) {
        this.logger.warn('Pexels API falló:', e.message);
      }
    }

    // 3️⃣ Picsum fallback — siempre carga, seed determinista por keyword
    const fallback = this.getPicsumImage(description);
    this.logger.log(`🖼️ Imagen Picsum fallback: ${fallback}`);
    return fallback;
  }

  async chat(
    messages: any[], 
    userId: string,
    currentPage?: number,
    documentState?: any,
    slideConfigs?: any,
    numPages?: number,
    baseWidth?: number,
    baseHeight?: number,
  ) {
    const cw = baseWidth || 1280;
    const ch = baseHeight || 720;
    const currentSlideElements = (documentState || {})[currentPage || 1] || [];

    // Build rich per-slide context
    const slidesSummary = Object.keys(documentState || {}).map(page => {
      const pageNum = Number(page);
      const elements = (documentState[page] || []).map((el: any) => ({
        id: el.id,
        type: el.type,
        label: el.content || el.text || el.iconName || el.chartType || el.src || el.qrUrl || el.items?.[0] || 'elemento',
        x: el.x, y: el.y, width: el.width, height: el.height,
      }));
      const bgColor = slideConfigs?.[pageNum]?.bgColor || '#ffffff';
      return `  Pág ${page} (fondo:${bgColor}, ${elements.length} elementos): ${JSON.stringify(elements)}`;
    }).join('\n');

    const systemMessage = {
      role: 'system',
      content: `Eres un asistente IA experto en diseño de presentaciones interactivas. Tienes poder total para crear, modificar y organizar cualquier elemento de la presentación.

## SISTEMA DE COORDENADAS Y LIENZO
- **Tamaño del lienzo:** ${cw}×${ch} px (ancho × alto)
- **Origen (0,0):** esquina superior izquierda
- **Eje X:** aumenta hacia la derecha (0 a ${cw})
- **Eje Y:** aumenta hacia abajo (0 a ${ch})
- **Zona segura (sin recorte):** margen 40px en todos los lados → área útil: x[40..${cw-40}], y[40..${ch-40}]

## GUÍA DE TAMAÑOS RECOMENDADOS
| Elemento | Ancho típico | Alto típico | Posición típica |
|---|---|---|---|
| Título principal | 800-1100px | 80-120px | x=90, y=60 |
| Subtítulo | 600-900px | 60-80px | x=90, y=190 |
| Párrafo de texto | 500-700px | auto | x=90, y=300 |
| Imagen de portada | 400-600px | 300-450px | centrada o lateral |
| Imagen decorativa | 200-350px | 200-350px | esquinas o lateral |
| Forma decorativa | 60-300px | 60-300px | libre |
| Icono | 48-96px | 48-96px | junto a texto |
| Tabla | 700-1000px | auto | x=140, y=200 |
| Gráfico | 500-700px | 350-450px | centrado |
| Lista | 400-700px | auto | x=90, y=200 |
| Botón/link | 160-220px | 44-56px | y=600-640 |
| QR | 150-200px | 150-200px | esquina inferior |

## JERARQUÍA VISUAL (layouts típicos)
- **Portada:** Título grande (top 30%), subtítulo, imagen de fondo o decorativa
- **Contenido:** Título arriba + texto/lista/imagen abajo
- **Dos columnas:** divide x=40..600 (col1) y x=680..1240 (col2)
- **Centrado:** usa x=(${cw}/2 - width/2), y=(${ch}/2 - height/2)
- **Cuadrícula 2x2:** cuatro elementos de ~540×280px en (40,40),(700,40),(40,380),(700,380)

## IMÁGENES
- Para add_image usa siempre **keywords en inglés** concretas y visuales (ej: "mountain snow peak aerial", "business team modern office", "solar system planets space"). Cuanto más específico mejor resultado.
- Si el usuario pide una imagen de algo muy concreto (marca, persona, logo), indica en tu respuesta que no es posible garantizar exactitud y usa la descripción más cercana.
- Nunca uses URLs de source.unsplash.com ni similares como parámetro src.

## FUENTES DISPONIBLES
Arial, Helvetica, Georgia, 'Times New Roman', Verdana, Trebuchet MS, 'Courier New', Impact, 'Comic Sans MS', Tahoma, 'Palatino Linotype', 'Book Antiqua'

## TAMAÑOS DE FUENTE RECOMENDADOS
- Título H1: 56-96px, fontWeight: 800
- Título H2: 40-56px, fontWeight: 700
- Subtítulo: 28-40px, fontWeight: 600
- Cuerpo: 20-28px, fontWeight: 400
- Pie/caption: 14-18px, fontWeight: 400

## CONTEXTO DE LA PRESENTACIÓN ACTUAL
- **Total de páginas:** ${numPages || 1}
- **Página activa del usuario:** ${currentPage || 1}
- **Elementos en página actual (${currentSlideElements.length} total):**
${currentSlideElements.map((el: any) => `  • [${el.id}] type=${el.type} pos=(${el.x},${el.y}) size=${el.width}×${el.height} → "${el.content || el.text || el.iconName || el.chartType || el.src || el.items?.[0] || 'sin texto'}"`).join('\n') || '  (diapositiva vacía)'}

## TODAS LAS DIAPOSITIVAS
${slidesSummary || '  (sin diapositivas)'}

## REGLAS CRÍTICAS DE EJECUCIÓN
- **targetPage**: Siempre especifica la página destino. Default = página activa (${currentPage || 1}).
- Usa **múltiples llamadas paralelas** para componer slides completos de una vez.
- Para modificar/eliminar un elemento, usa su **id exacto** de la lista de arriba.
- Si el usuario pide "crear una presentación sobre X", genera múltiples slides con add_slide + contenido.
- Usa **get_slide_elements** para inspeccionar una diapositiva antes de modificarla.
- Usa **clear_slide** con cuidado (elimina TODO el contenido de la diapositiva).
- Usa **navigate_to_slide** para llevar al usuario a la diapositiva correcta después de trabajar en ella.
- Identificador de usuario: ${userId}`
    };

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
              targetPage: { type: 'number', description: 'Página/diapositiva destino (ej: 1, 2, 3).' },
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
              targetPage: { type: 'number', description: 'Página/diapositiva destino (ej: 1, 2, 3).' },
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
              targetPage: { type: 'number', description: 'Página/diapositiva destino.' },
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
          description: 'Añade una imagen a la presentación. Proporciona SIEMPRE "description" con palabras clave en inglés descriptivas y concretas (ej: "mountain snow landscape", "modern office team", "solar system planets"). Opcionalmente puedes pasar "src" con una URL directa válida si conoces una fuente fiable.',
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Palabras clave en inglés para buscar la imagen (ej: "mountain sunset", "technology circuit board"). Sé específico para obtener mejores resultados.' },
              src: { type: 'string', description: 'URL directa de imagen (opcional). Si la proporcionas, se usará en lugar de buscar.' },
              targetPage: { type: 'number', description: 'Página/diapositiva destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
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
              targetPage: { type: 'number', description: 'Página destino.' },
              language: { type: 'string', description: 'Lenguaje de programación.' },
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
              targetPage: { type: 'number', description: 'Página/diapositiva destino (ej: 1, 2, 3).' },
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
              targetPage: { type: 'number', description: 'Página destino (opcional, por si necesitas moverlo de página).' },
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
          name: 'add_3d',
          description: 'Añade un modelo 3D (glb/gltf) a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              src: { type: 'string', description: 'URL del modelo 3D (.glb o .gltf)' },
              targetPage: { type: 'number', description: 'Página destino.' },
              autoRotate: { type: 'boolean', description: 'Rotación automática del modelo' },
              cameraControls: { type: 'boolean', description: 'Habilitar controles de cámara' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' }
            },
            required: ['src'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_iframe',
          description: 'Añade un Iframe/página web incrustada a la presentación actual.',
          parameters: {
            type: 'object',
            properties: {
              src: { type: 'string', description: 'URL de la web a incrustar' },
              targetPage: { type: 'number', description: 'Página destino.' },
              x: { type: 'number', description: 'Posición X en píxeles (opcional, centrado por defecto).' },
              y: { type: 'number', description: 'Posición Y en píxeles (opcional, centrado por defecto).' },
              width: { type: 'number', description: 'Ancho en píxeles.' },
              height: { type: 'number', description: 'Alto en píxeles.' },
              borderRadius: { type: 'number', description: 'Radio de borde en píxeles.' },
              borderColor: { type: 'string', description: 'Color del borde en HEX.' },
              borderWidth: { type: 'number', description: 'Grosor del borde en píxeles.' }
            },
            required: ['src'],
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
      // 🔍 HERRAMIENTAS DE INSPECCIÓN Y NAVEGACIÓN
      {
        type: 'function',
        function: {
          name: 'get_slide_elements',
          description: 'Obtiene todos los elementos detallados de una diapositiva específica (id, tipo, posición, tamaño, contenido). Úsalo para inspeccionar antes de modificar.',
          parameters: {
            type: 'object',
            properties: {
              slideNumber: { type: 'number', description: 'Número de diapositiva a inspeccionar.' }
            },
            required: ['slideNumber'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'navigate_to_slide',
          description: 'Navega al usuario a una diapositiva específica. Úsalo tras crear/modificar una slide para que el usuario la vea.',
          parameters: {
            type: 'object',
            properties: {
              page: { type: 'number', description: 'Número de diapositiva a la que navegar.' }
            },
            required: ['page'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'clear_slide',
          description: 'Elimina TODOS los elementos de una diapositiva, dejándola vacía. Útil para rediseñar desde cero.',
          parameters: {
            type: 'object',
            properties: {
              targetPage: { type: 'number', description: 'Número de diapositiva a vaciar.' }
            },
            required: ['targetPage'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'duplicate_slide',
          description: 'Duplica una diapositiva existente al final de la presentación (copia elementos y fondo).',
          parameters: {
            type: 'object',
            properties: {
              fromPage: { type: 'number', description: 'Número de diapositiva a duplicar.' }
            },
            required: ['fromPage'],
          },
        },
      },
    ];

    const apiMessages: any[] = [systemMessage, ...messages];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: apiMessages,
      tools: tools,
      tool_choice: 'auto',
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
          if (functionName === 'navigate_to_slide' || functionName === 'clear_slide' || functionName === 'duplicate_slide') {
            // Frontend-handled actions
            let actionType = functionName.replace(/_([a-z])/g, (g: string) => g[1].toUpperCase());
            const action = { actionType, ...functionArgs };
            this.logger.log(`✨ Ejecutando herramienta de navegación/gestión: ${actionType}`);
            frontendActions.push(action);
            functionResult = { success: true, message: `Acción enviada al editor: ${actionType}` };
          }
          else if (functionName.startsWith('add_') || functionName === 'change_background' || functionName === 'add_slide' || functionName.includes('element')) {
            // Generico: Transformar foo_bar_baz en addFooBarBaz o camelCase general para toolName si es necesario
            // pero el frontend procesa por actionType.startsWith('add')
            let actionType = functionName;
            if (actionType.includes('_')) {
              actionType = actionType.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
            }

            // Para imágenes, buscar recurso directamente si es necesario
            if (functionName === 'add_image' || actionType === 'addImage') {
              // Si la IA ya proporcionó una src válida, úsala directamente
              if (!functionArgs.src || !functionArgs.src.startsWith('http')) {
                functionArgs.src = await this.searchRealImage(functionArgs.description || 'nature landscape');
              } else {
                this.logger.log(`🖼️ Usando src directa de la IA: ${functionArgs.src}`);
              }
            }

            const action = { actionType, ...functionArgs };
            this.logger.log(`✨ Ejecutando herramienta genérica: ${actionType}`);
            frontendActions.push(action);
            functionResult = { success: true, message: `Acción enviada al lienzo: ${actionType}` };
          }
          if (functionName === 'list_elements') {
            // Returns elements of the current page from the documentState passed in
            const pageElems = (documentState || {})[currentPage || 1] || [];
            functionResult = {
              page: currentPage || 1,
              elements: pageElems.map((el: any) => ({
                id: el.id, type: el.type,
                x: el.x, y: el.y, width: el.width, height: el.height,
                content: el.content || el.text || el.iconName || el.chartType || el.src || el.qrUrl || el.items?.[0] || null,
              }))
            };
          }
          else if (functionName === 'get_slide_elements') {
            const targetSlide = functionArgs.slideNumber || currentPage || 1;
            const pageElems = (documentState || {})[targetSlide] || [];
            functionResult = {
              page: targetSlide,
              bgColor: slideConfigs?.[targetSlide]?.bgColor || '#ffffff',
              elements: pageElems.map((el: any) => ({
                id: el.id, type: el.type,
                x: el.x, y: el.y, width: el.width, height: el.height,
                color: el.color, bgColor: el.bgColor, fontSize: el.fontSize,
                content: el.content || el.text || el.iconName || el.chartType || el.src || el.qrUrl || JSON.stringify(el.items || el.chartData || el.headers || null),
              }))
            };
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
        model: 'gpt-5-mini',
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