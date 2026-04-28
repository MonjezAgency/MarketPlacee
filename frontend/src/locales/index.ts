import { en } from './en';
import { ar } from './ar';
import { ro } from './ro';
import { fr } from './fr';

// Other languages inherit all keys from English with overridden navbar labels
const de = { ...en, navbar: { ...en.navbar, dashboard: "Armaturenbrett", categories: "Kategorien", cart: "Einkaufswagen", account: "Konto", searchPlaceholder: "Atlantis durchsuchen", helloSignIn: "Hallo, Anmelden", login: "Anmelden", logout: "Abmelden", allCategories: "Alle Kategorien", browseCatalog: "Gesamten Katalog durchsuchen", volumeDeals: "Mengenrabatte", supplyPartners: "Lieferpartner", logisticsHelp: "Logistik-Hilfe", corporateAccounts: "Geschäftskonten" }, common: { ...en.common, search: "Suchen", approve: "Genehmigen", reject: "Ablehnen", cancel: "Abbrechen", save: "Speichern", loading: "Laden...", add: "Hinzufügen", edit: "Bearbeiten", delete: "Löschen", back: "Zurück" } };
const es = { ...en, navbar: { ...en.navbar, dashboard: "Panel", categories: "Categorías", cart: "Carrito", account: "Cuenta", searchPlaceholder: "Buscar en Atlantis", helloSignIn: "Hola, Inicia sesión", login: "Iniciar sesión", logout: "Cerrar sesión", allCategories: "Todas las categorías", browseCatalog: "Ver todo el catálogo", volumeDeals: "Ofertas por volumen", supplyPartners: "Socios", logisticsHelp: "Ayuda logística", corporateAccounts: "Cuentas corporativas" }, common: { ...en.common, search: "Buscar", approve: "Aprobar", reject: "Rechazar", cancel: "Cancelar", save: "Guardar", loading: "Cargando...", add: "Agregar", edit: "Editar", delete: "Eliminar", back: "Volver" } };
const pt = { ...en, navbar: { ...en.navbar, dashboard: "Painel", categories: "Categorias", cart: "Carrinho", account: "Conta", searchPlaceholder: "Pesquisar no Atlantis", helloSignIn: "Olá, Entre", login: "Entrar", logout: "Sair", allCategories: "Todas as categorias", browseCatalog: "Ver catálogo completo", volumeDeals: "Ofertas por volume", supplyPartners: "Parceiros", logisticsHelp: "Ajuda logística", corporateAccounts: "Contas empresariais" }, common: { ...en.common, search: "Pesquisar", approve: "Aprovar", reject: "Rejeitar", cancel: "Cancelar", save: "Salvar", loading: "Carregando...", add: "Adicionar", edit: "Editar", delete: "Excluir", back: "Voltar" } };

export const translations = {
    en, ar, de, fr, es, pt, ro
};

export type Locale = keyof typeof translations;
export type TranslationKey = keyof typeof en;
