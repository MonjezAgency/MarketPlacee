import { defineSection } from './define';

/** Admin shell: sidebar labels added in the navigation cleanup, and the account menu in the sidebar footer. */
export default defineSection('adminNav', ['src/app/admin/layout.tsx', 'src/components/admin/AdminAccountMenu.tsx'], {
    en: {
        soonBadge: 'Soon',
        noAccessTitle: "You don’t have access to this page", noAccessBody: "Your role doesn’t include this part of the admin. If you need it, ask an Atlantis admin to change your role.", noAccessHome: "Go to your start page",
        offers: 'Offers', supportHq: 'Support HQ', settings: 'Settings', orders: 'Orders',
        accountMenu: 'Account menu', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeSystem: 'System',
        language: 'Language', signOut: 'Sign out', marketplaceHome: 'Atlantis marketplace home',
    },
    ar: {
        soonBadge: 'قريبًا',
        noAccessTitle: "ليست لديك صلاحية لهذه الصفحة", noAccessBody: "دورك لا يشمل هذا الجزء من لوحة الإدارة. إذا كنت تحتاجه، اطلب من أحد مسؤولي Atlantis تغيير دورك.", noAccessHome: "الانتقال إلى صفحة البداية",
        offers: 'العروض', supportHq: 'مركز الدعم', settings: 'الإعدادات', orders: 'الطلبات',
        accountMenu: 'قائمة الحساب', theme: 'المظهر', themeLight: 'فاتح', themeDark: 'داكن', themeSystem: 'حسب النظام',
        language: 'اللغة', signOut: 'تسجيل الخروج', marketplaceHome: 'الصفحة الرئيسية لسوق Atlantis',
    },
    fr: {
        soonBadge: 'Bientôt',
        noAccessTitle: "Vous n’avez pas accès à cette page", noAccessBody: "Votre rôle n’inclut pas cette partie de l’administration. Si vous en avez besoin, demandez à un administrateur Atlantis de modifier votre rôle.", noAccessHome: "Aller à votre page d’accueil",
        offers: 'Offres', supportHq: 'Centre de support', settings: 'Paramètres', orders: 'Commandes',
        accountMenu: 'Menu du compte', theme: 'Thème', themeLight: 'Clair', themeDark: 'Sombre', themeSystem: 'Système',
        language: 'Langue', signOut: 'Se déconnecter', marketplaceHome: 'Accueil de la marketplace Atlantis',
    },
    ro: {
        soonBadge: 'În curând',
        noAccessTitle: "Nu aveți acces la această pagină", noAccessBody: "Rolul dumneavoastră nu include această parte a administrării. Dacă aveți nevoie de ea, cereți unui administrator Atlantis să vă schimbe rolul.", noAccessHome: "Mergeți la pagina de start",
        offers: 'Oferte', supportHq: 'Centrul de asistență', settings: 'Setări', orders: 'Comenzi',
        accountMenu: 'Meniul contului', theme: 'Temă', themeLight: 'Luminoasă', themeDark: 'Întunecată', themeSystem: 'Sistem',
        language: 'Limbă', signOut: 'Deconectare', marketplaceHome: 'Pagina principală a marketplace-ului Atlantis',
    },
    it: {
        soonBadge: 'Presto',
        noAccessTitle: "Non hai accesso a questa pagina", noAccessBody: "Il tuo ruolo non include questa parte dell’amministrazione. Se ti serve, chiedi a un amministratore Atlantis di cambiare il tuo ruolo.", noAccessHome: "Vai alla tua pagina iniziale",
        offers: 'Offerte', supportHq: 'Centro assistenza', settings: 'Impostazioni', orders: 'Ordini',
        accountMenu: 'Menu account', theme: 'Tema', themeLight: 'Chiaro', themeDark: 'Scuro', themeSystem: 'Sistema',
        language: 'Lingua', signOut: 'Esci', marketplaceHome: 'Home del marketplace Atlantis',
    },
    es: {
        soonBadge: 'Pronto',
        noAccessTitle: "No tienes acceso a esta página", noAccessBody: "Tu rol no incluye esta parte de la administración. Si la necesitas, pide a un administrador de Atlantis que cambie tu rol.", noAccessHome: "Ir a tu página de inicio",
        offers: 'Ofertas', supportHq: 'Centro de soporte', settings: 'Ajustes', orders: 'Pedidos',
        accountMenu: 'Menú de la cuenta', theme: 'Tema', themeLight: 'Claro', themeDark: 'Oscuro', themeSystem: 'Sistema',
        language: 'Idioma', signOut: 'Cerrar sesión', marketplaceHome: 'Inicio del marketplace Atlantis',
    },
    pt: {
        soonBadge: 'Brevemente',
        noAccessTitle: "Não tem acesso a esta página", noAccessBody: "O seu perfil não inclui esta parte da administração. Se precisar dela, peça a um administrador da Atlantis para alterar o seu perfil.", noAccessHome: "Ir para a sua página inicial",
        offers: 'Ofertas', supportHq: 'Centro de apoio', settings: 'Definições', orders: 'Encomendas',
        accountMenu: 'Menu da conta', theme: 'Tema', themeLight: 'Claro', themeDark: 'Escuro', themeSystem: 'Sistema',
        language: 'Idioma', signOut: 'Terminar sessão', marketplaceHome: 'Página inicial do marketplace Atlantis',
    },
});
