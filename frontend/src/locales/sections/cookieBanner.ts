import { defineSection } from './define';

/** Cookie notice shown on first visit (components/CookieConsent.tsx). Claims match app/cookie-policy and the code:
 *  sign-in cookies (token / refreshToken), language, cart and this choice stored on the device; no advertising or third-party trackers. */
export default defineSection('cookieBanner', ['src/components/CookieConsent.tsx'], {
    en: {
        title: 'Cookies on Atlantis',
        body: 'We use essential cookies to keep you signed in and secure, and store your language, cart and this choice on your device. We don’t use advertising or third-party tracking cookies. Read our <link>Cookie Policy</link>.',
        decline: 'Decline', accept: 'Accept', dismiss: 'Close cookie notice', region: 'Cookie notice',
    },
    ar: {
        title: 'ملفات تعريف الارتباط على Atlantis',
        body: 'نستخدم ملفات تعريف الارتباط الضرورية لإبقائك مسجّلًا الدخول وحماية حسابك، ونحفظ لغتك وسلّتك واختيارك هذا على جهازك. لا نستخدم ملفات تعريف ارتباط إعلانية أو ملفات تتبّع من جهات خارجية. اطّلع على <link>سياسة ملفات تعريف الارتباط</link>.',
        decline: 'رفض', accept: 'قبول', dismiss: 'إغلاق إشعار ملفات تعريف الارتباط', region: 'إشعار ملفات تعريف الارتباط',
    },
    fr: {
        title: 'Cookies sur Atlantis',
        body: 'Nous utilisons des cookies essentiels pour vous garder connecté et sécuriser votre compte, et nous enregistrons votre langue, votre panier et ce choix sur votre appareil. Nous n’utilisons ni cookies publicitaires ni traceurs tiers. Consultez notre <link>politique relative aux cookies</link>.',
        decline: 'Refuser', accept: 'Accepter', dismiss: 'Fermer l’avis sur les cookies', region: 'Avis sur les cookies',
    },
    ro: {
        title: 'Cookie-uri pe Atlantis',
        body: 'Folosim cookie-uri esențiale pentru a vă menține autentificat și în siguranță și salvăm pe dispozitivul dumneavoastră limba, coșul și această alegere. Nu folosim cookie-uri de publicitate sau de urmărire de la terți. Citiți <link>Politica privind cookie-urile</link>.',
        decline: 'Refuzați', accept: 'Acceptați', dismiss: 'Închideți notificarea despre cookie-uri', region: 'Notificare despre cookie-uri',
    },
    it: {
        title: 'Cookie su Atlantis',
        body: 'Usiamo cookie essenziali per mantenerti connesso e al sicuro, e salviamo sul tuo dispositivo la lingua, il carrello e questa scelta. Non usiamo cookie pubblicitari né tracciamento di terze parti. Leggi la nostra <link>Cookie Policy</link>.',
        decline: 'Rifiuta', accept: 'Accetta', dismiss: 'Chiudi l’avviso sui cookie', region: 'Avviso sui cookie',
    },
    es: {
        title: 'Cookies en Atlantis',
        body: 'Usamos cookies esenciales para mantener tu sesión iniciada y segura, y guardamos en tu dispositivo tu idioma, tu carrito y esta elección. No usamos cookies publicitarias ni de seguimiento de terceros. Consulta nuestra <link>Política de cookies</link>.',
        decline: 'Rechazar', accept: 'Aceptar', dismiss: 'Cerrar el aviso de cookies', region: 'Aviso de cookies',
    },
    pt: {
        title: 'Cookies na Atlantis',
        body: 'Utilizamos cookies essenciais para manter a sua sessão iniciada e segura, e guardamos no seu dispositivo o seu idioma, o seu carrinho e esta escolha. Não utilizamos cookies de publicidade nem de rastreamento de terceiros. Consulte a nossa <link>Política de cookies</link>.',
        decline: 'Recusar', accept: 'Aceitar', dismiss: 'Fechar o aviso de cookies', region: 'Aviso de cookies',
    },
});
