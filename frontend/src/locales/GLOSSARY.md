# Ali FMCG translation glossary

One term per concept, used everywhere. Ali FMCG is a B2B FMCG wholesale marketplace
(business buyers, suppliers, cases/cartons, pallets, truckloads). Keep the tone clear,
professional and concise — short UI labels, no marketing fluff.

Never translate: Ali FMCG, Monjez, Stripe, EAN, EXW, SKU, MOQ, email addresses, URLs,
{placeholders}, <tags>, product names, order ids, currency codes.

Register: fr = vous · ro = formal (imperative plural: „Introduceți”, „dumneavoastră”) ·
it = tu (standard in Italian UIs) · es = tú (standard in Spanish e-commerce UIs) ·
pt = European Portuguese (pt-PT), formal third person („a sua conta”), never Brazilian forms.

| English | fr | ro | it | es | pt (Portugal) |
|---|---|---|---|---|---|
| order | commande | comandă | ordine | pedido | encomenda |
| supplier | fournisseur | furnizor | fornitore | proveedor | fornecedor |
| buyer | acheteur | cumpărător | acquirente | comprador | comprador |
| carton / case | carton | bax | cartone | caja | caixa |
| pallet | palette | palet | pallet | palé | palete |
| truck / truckload | camion / camion complet | camion / camion complet | camion / carico completo | camión / camión completo | camião / camião completo |
| mixed load | chargement mixte | încărcătură mixtă | carico misto | carga mixta | carga mista |
| delivery | livraison | livrare | consegna | entrega | entrega |
| dispatched / shipped | expédiée | expediată | spedito | enviado | expedida |
| inspection | inspection | inspecție | ispezione | inspección | inspeção |
| dispute | litige | dispută | contestazione | reclamación | litígio |
| refund | remboursement | rambursare | rimborso | reembolso | reembolso |
| returns & refunds | Retours et remboursements | Retururi și rambursări | Resi e rimborsi | Devoluciones y reembolsos | Devoluções e reembolsos |
| Ali FMCG hub | hub Ali FMCG | hub Ali FMCG | hub Ali FMCG | centro logístico de Ali FMCG | centro logístico da Ali FMCG |
| VAT | TVA | TVA | IVA | IVA | IVA |
| cart | panier | coș | carrello | carrito | carrinho |
| sign in / sign out | se connecter / se déconnecter | conectare / deconectare | accedi / esci | iniciar sesión / cerrar sesión | iniciar sessão / terminar sessão |
| dashboard | tableau de bord | panou de control | pannello di controllo | panel | painel |
| unit (piece) | unité | unitate | unità | unidad | unidade |
| business days | jours ouvrés | zile lucrătoare | giorni lavorativi | días hábiles | dias úteis |
| confirm receipt | confirmer la réception | confirmați recepția | conferma la ricezione | confirmar la recepción | confirmar a receção |

Romanian: always comma-below ș ț (U+0219, U+021B), never cedilla ş ţ.
Portuguese (Portugal): receção, ecrã, utilizador, telemóvel, registar, equipa, contacto, facto.
Plurals use ICU syntax: "{count, plural, one {# palette} other {# palettes}}".
Required forms: fr/it/es/pt: one, other · ro: one, few, other · ar: zero, one, two, few, many, other.

## Arabic (ar) — Modern Standard Arabic, professional B2B tone

| English | Arabic |
|---|---|
| order / orders | الطلب / الطلبات |
| supplier | المورّد |
| buyer | المشتري |
| carton / case | كرتونة (كراتين) |
| pallet | منصّة (منصّات) |
| truck / truckload | شاحنة / شاحنة كاملة |
| mixed load | حمولة مختلطة |
| delivery | التوصيل |
| shipped / dispatched | تم الشحن |
| inspection | الفحص |
| dispute | نزاع |
| refund | استرداد |
| cart | السلة |
| sign in / sign out | تسجيل الدخول / تسجيل الخروج |
| dashboard | لوحة التحكم |
| products / catalog | المنتجات / الكتالوج |
| inventory / stock | المخزون |
| price / prices | السعر / الأسعار |
| unit (piece) | وحدة |
| business days | أيام عمل |
| settings | الإعدادات |
| support | الدعم |
| earnings | الأرباح |
| payout | الدفعات المستحقة |
| listing | المنتج المعروض |

Arabic plurals need zero, one, two, few, many, other. Wrap numeric ranges (48–72, {min}–{max}) in U+2066 … U+2069 so they don't reverse in RTL.

## What stays in English (all languages)

Keep as-is: product names, brand names, model names, EAN/barcodes, SKUs, order ids, invoice numbers, tracking numbers, email addresses, URLs, currency codes (EUR), Incoterms (EXW), file formats (CSV, XLSX, PDF), API/code values and enum values sent to the server. Wrap them in `<bdi dir="ltr">` (or the `Ltr` helper) inside Arabic text.

Everything else that a user reads — labels, headings, buttons, helper text, statuses, empty states, errors — is translated, even when it sits next to an English product name. "Dashboard", "Orders", "Settings", "Track" as interface labels are translated (لوحة التحكم، الطلبات، الإعدادات، تتبّع الطلب). Only keep an English term when it is a product or brand name in that exact context.
