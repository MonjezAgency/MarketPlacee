import { defineSection } from './define';

/** Admin shell: sidebar labels added in the navigation cleanup, and the account menu in the sidebar footer. */
export default defineSection('adminNav', ['src/app/admin/layout.tsx', 'src/components/admin/AdminAccountMenu.tsx'], {
    en: {
        offers: 'Offers', supportHq: 'Support HQ', settings: 'Settings', orders: 'Orders',
        accountMenu: 'Account menu', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeSystem: 'System',
        language: 'Language', signOut: 'Sign out', marketplaceHome: 'Atlantis marketplace home',
    },
    ar: {
        offers: 'العروض', supportHq: 'مركز الدعم', settings: 'الإعدادات', orders: 'الطلبات',
        accountMenu: 'قائمة الحساب', theme: 'المظهر', themeLight: 'فاتح', themeDark: 'داكن', themeSystem: 'حسب النظام',
        language: 'اللغة', signOut: 'تسجيل الخروج', marketplaceHome: 'الصفحة الرئيسية لسوق Atlantis',
    },
    fr: {
        offers: 'Offres', supportHq: 'Centre de support', settings: 'Paramètres', orders: 'Commandes',
        accountMenu: 'Menu du compte', theme: 'Thème', themeLight: 'Clair', themeDark: 'Sombre', themeSystem: 'Système',
        language: 'Langue', signOut: 'Se déconnecter', marketplaceHome: 'Accueil de la marketplace Atlantis',
    },
    ro: {
        offers: 'Oferte', supportHq: 'Centrul de asistență', settings: 'Setări', orders: 'Comenzi',
        accountMenu: 'Meniul contului', theme: 'Temă', themeLight: 'Luminoasă', themeDark: 'Întunecată', themeSystem: 'Sistem',
        language: 'Limbă', signOut: 'Deconectare', marketplaceHome: 'Pagina principală a marketplace-ului Atlantis',
    },
    it: {
        offers: 'Offerte', supportHq: 'Centro assistenza', settings: 'Impostazioni', orders: 'Ordini',
        accountMenu: 'Menu account', theme: 'Tema', themeLight: 'Chiaro', themeDark: 'Scuro', themeSystem: 'Sistema',
        language: 'Lingua', signOut: 'Esci', marketplaceHome: 'Home del marketplace Atlantis',
    },
    es: {
        offers: 'Ofertas', supportHq: 'Centro de soporte', settings: 'Ajustes', orders: 'Pedidos',
        accountMenu: 'Menú de la cuenta', theme: 'Tema', themeLight: 'Claro', themeDark: 'Oscuro', themeSystem: 'Sistema',
        language: 'Idioma', signOut: 'Cerrar sesión', marketplaceHome: 'Inicio del marketplace Atlantis',
    },
    pt: {
        offers: 'Ofertas', supportHq: 'Centro de apoio', settings: 'Definições', orders: 'Encomendas',
        accountMenu: 'Menu da conta', theme: 'Tema', themeLight: 'Claro', themeDark: 'Escuro', themeSystem: 'Sistema',
        language: 'Idioma', signOut: 'Terminar sessão', marketplaceHome: 'Página inicial do marketplace Atlantis',
    },
});
