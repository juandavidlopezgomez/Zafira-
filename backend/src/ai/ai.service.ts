import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class AiService {
  private readonly client: OpenAI;
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
  }

  async complete(prompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.8,
    });
    return res.choices[0]?.message.content?.trim() ?? '';
  }

  async moderate(text: string): Promise<{ flagged: boolean; categories: Record<string, boolean> }> {
    try {
      const res = await this.client.moderations.create({ input: text });
      const result = res.results[0];
      return {
        flagged: result?.flagged ?? false,
        categories: (result?.categories as unknown as Record<string, boolean>) ?? {},
      };
    } catch (err) {
      this.logger.error('Moderation API error', err);
      return { flagged: false, categories: {} };
    }
  }

  async generateChallenge(type: string, intensity: number, tags: string[]): Promise<string> {
    const prompt = `Eres un generador de retos para un juego social entre jóvenes. Genera UN reto de tipo "${type}" con intensidad ${intensity}/5. Tags de contexto: ${tags.join(', ')}.
    El reto debe ser divertido, atrevido pero respetuoso. Solo devuelve el texto del reto, sin comillas ni explicaciones adicionales. Máximo 2 oraciones.`;
    return this.complete(prompt);
  }
}
