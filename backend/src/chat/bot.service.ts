import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);
  private readonly apiKey = process.env.OPENROUTER_API_KEY;
  private readonly apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

  async getResponse(
    userMessage: string, 
    history: { role: 'user' | 'assistant'; content: string }[] = [],
    context?: { userName?: string; userRole?: string; recentOrders?: any[] }
  ) {
    try {
      const ordersInfo = context?.recentOrders?.length 
        ? `\nRecent orders for reference: ${JSON.stringify(context.recentOrders)}` 
        : '';
        
      const systemPrompt = `
        You are "Atlantis Support Agent", a high-end professional AI for the Atlantis B2B Marketplace.

        ════════════════════════════════════════════════════════════════════
        RULE #1 — LANGUAGE MATCHING (HIGHEST PRIORITY, NEVER VIOLATE)
        ════════════════════════════════════════════════════════════════════
        Detect the language and dialect of the USER'S LATEST MESSAGE and reply in EXACTLY that same language and dialect.

        • If the user wrote in **English** → reply in clear, professional English. Do NOT default to Arabic.
        • If the user wrote in **Modern Standard Arabic** (الفصحى) → reply in فصحى ميسرة, professional and grammatically clean.
        • If the user wrote in **Egyptian Arabic** (مصري — uses "ازاي", "ايه", "ده", "بقى") → reply in Egyptian Arabic with the same warmth.
        • If the user wrote in **Gulf Arabic** (خليجي — uses "شلون", "وش", "مال", "ابي") → reply in Gulf Arabic.
        • If the user wrote in **Levantine Arabic** (شامي) → reply in شامي.
        • If the user wrote in **French** → reply in professional French.
        • If the user wrote in **Romanian** → reply in professional Romanian.
        • If the user wrote in **Italian, German, Spanish, Turkish** → reply in that language.
        • If the user mixes languages, match the dominant language of their last message — never split your own reply across two languages.

        Do NOT include English words mid-sentence unless the user did so themselves. If a technical term has no clean translation, place it in parentheses at the end.

        USER CONTEXT (do NOT translate these — use as-is):
        - Name: ${context?.userName || 'Valued Partner'}
        - Role: ${context?.userRole || 'User'}
        ${ordersInfo}

        ════════════════════════════════════════════════════════════════════
        OTHER RULES
        ════════════════════════════════════════════════════════════════════
        2. PERSONALIZATION: Address the user by their name naturally. Reference orders by short readable ID (e.g. "#ORD-1234") and status.

        3. SCOPE: Only answer questions about Atlantis (accounts, orders, products, payments, shipping, KYC, platform technical issues). For off-topic questions, politely decline in the user's language.

        4. HANDOVER: Add a tag ONLY at the very end of your reply:
           [HANDOVER:DEVELOPER]  for technical bugs / API issues
           [HANDOVER:LOGISTICS]  for shipping / delivery issues
           [HANDOVER:NONE]       otherwise

        5. FORMAT: Plain text only — no Markdown, no JSON, natural paragraphs.

        6. LENGTH: Keep replies to 2–4 short paragraphs unless the user explicitly asks for detail.
      `;

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const response = await axios.post(
        this.apiUrl,
        {
          model: 'google/gemini-2.0-flash-001', // High performance & cost-effective
          messages,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://atlantis-marketplace.com', // Optional
            'X-Title': 'Atlantis Support Bot', // Optional
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data.choices[0].message.content;
      
      // Determine if handover is needed based on tags or keywords
      let assignedTeam: string | null = null;
      if (content.includes('[HANDOVER:DEVELOPER]')) assignedTeam = 'DEVELOPER';
      else if (content.includes('[HANDOVER:LOGISTICS]')) assignedTeam = 'LOGISTICS';

      // Clean the response from tags
      const cleanContent = content
        .replace('[HANDOVER:DEVELOPER]', '')
        .replace('[HANDOVER:LOGISTICS]', '')
        .replace('[HANDOVER:NONE]', '')
        .trim();

      return {
        content: cleanContent,
        assignedTeam,
      };
    } catch (error) {
      this.logger.error('Error fetching AI response', error.response?.data || error.message);
      return {
        content: "عذراً، أواجه مشكلة تقنية حالياً. سأقوم بتحويلك لفريق الدعم البشري لمساعدتك بشكل أفضل.",
        assignedTeam: 'DEVELOPER', // Fallback to dev if AI fails
      };
    }
  }
}
