/**
 * Seed script for initial translations
 * Run with: node scripts/seed-translations.js
 */

const mongoose = require('mongoose');
const Translation = require('../src/models/Translation');

const translations = {
  // Common namespace
  common: {
    en: {
      'app.name': 'Surebet Detector',
      'app.tagline': 'Professional arbitrage betting tool',
      'nav.dashboard': 'Dashboard',
      'nav.opportunities': 'Opportunities',
      'nav.bets': 'My Bets',
      'nav.analytics': 'Analytics',
      'nav.settings': 'Settings',
      'action.save': 'Save',
      'action.cancel': 'Cancel',
      'action.delete': 'Delete',
      'action.edit': 'Edit',
      'action.search': 'Search',
      'action.filter': 'Filter',
      'action.refresh': 'Refresh',
      'action.close': 'Close',
      'action.confirm': 'Confirm',
      'action.back': 'Back',
      'action.next': 'Next',
      'status.loading': 'Loading...',
      'status.error': 'Error',
      'status.success': 'Success',
      'status.pending': 'Pending',
      'status.active': 'Active',
      'status.inactive': 'Inactive',
      'time.now': 'Now',
      'time.minutes_ago': '{{count}} minutes ago',
      'time.hours_ago': '{{count}} hours ago',
      'time.days_ago': '{{count}} days ago'
    },
    fr: {
      'app.name': 'Détecteur de Surebet',
      'app.tagline': 'Outil professionnel d\'arbitrage de paris',
      'nav.dashboard': 'Tableau de bord',
      'nav.opportunities': 'Opportunités',
      'nav.bets': 'Mes Paris',
      'nav.analytics': 'Analyses',
      'nav.settings': 'Paramètres',
      'action.save': 'Enregistrer',
      'action.cancel': 'Annuler',
      'action.delete': 'Supprimer',
      'action.edit': 'Modifier',
      'action.search': 'Rechercher',
      'action.filter': 'Filtrer',
      'action.refresh': 'Actualiser',
      'action.close': 'Fermer',
      'action.confirm': 'Confirmer',
      'action.back': 'Retour',
      'action.next': 'Suivant',
      'status.loading': 'Chargement...',
      'status.error': 'Erreur',
      'status.success': 'Succès',
      'status.pending': 'En attente',
      'status.active': 'Actif',
      'status.inactive': 'Inactif',
      'time.now': 'Maintenant',
      'time.minutes_ago': 'Il y a {{count}} minutes',
      'time.hours_ago': 'Il y a {{count}} heures',
      'time.days_ago': 'Il y a {{count}} jours'
    },
    es: {
      'app.name': 'Detector de Surebet',
      'app.tagline': 'Herramienta profesional de arbitraje de apuestas',
      'nav.dashboard': 'Panel',
      'nav.opportunities': 'Oportunidades',
      'nav.bets': 'Mis Apuestas',
      'nav.analytics': 'Análisis',
      'nav.settings': 'Configuración',
      'action.save': 'Guardar',
      'action.cancel': 'Cancelar',
      'action.delete': 'Eliminar',
      'action.edit': 'Editar',
      'action.search': 'Buscar',
      'action.filter': 'Filtrar',
      'action.refresh': 'Actualizar',
      'action.close': 'Cerrar',
      'action.confirm': 'Confirmar',
      'action.back': 'Atrás',
      'action.next': 'Siguiente',
      'status.loading': 'Cargando...',
      'status.error': 'Error',
      'status.success': 'Éxito',
      'status.pending': 'Pendiente',
      'status.active': 'Activo',
      'status.inactive': 'Inactivo',
      'time.now': 'Ahora',
      'time.minutes_ago': 'Hace {{count}} minutos',
      'time.hours_ago': 'Hace {{count}} horas',
      'time.days_ago': 'Hace {{count}} días'
    },
    de: {
      'app.name': 'Surebet Detektor',
      'app.tagline': 'Professionelles Arbitrage-Wett-Tool',
      'nav.dashboard': 'Dashboard',
      'nav.opportunities': 'Möglichkeiten',
      'nav.bets': 'Meine Wetten',
      'nav.analytics': 'Analysen',
      'nav.settings': 'Einstellungen',
      'action.save': 'Speichern',
      'action.cancel': 'Abbrechen',
      'action.delete': 'Löschen',
      'action.edit': 'Bearbeiten',
      'action.search': 'Suchen',
      'action.filter': 'Filtern',
      'action.refresh': 'Aktualisieren',
      'action.close': 'Schließen',
      'action.confirm': 'Bestätigen',
      'action.back': 'Zurück',
      'action.next': 'Weiter',
      'status.loading': 'Laden...',
      'status.error': 'Fehler',
      'status.success': 'Erfolg',
      'status.pending': 'Ausstehend',
      'status.active': 'Aktiv',
      'status.inactive': 'Inaktiv',
      'time.now': 'Jetzt',
      'time.minutes_ago': 'Vor {{count}} Minuten',
      'time.hours_ago': 'Vor {{count}} Stunden',
      'time.days_ago': 'Vor {{count}} Tagen'
    },
    // Arabic (RTL)
    ar: {
      'app.name': 'كاشف الفرص الآمنة',
      'app.tagline': 'أداة المراجحة الاحترافية للرهان',
      'nav.dashboard': 'لوحة التحكم',
      'nav.opportunities': 'الفرص',
      'nav.bets': 'رهاناتي',
      'nav.analytics': 'التحليلات',
      'nav.settings': 'الإعدادات',
      'action.save': 'حفظ',
      'action.cancel': 'إلغاء',
      'action.delete': 'حذف',
      'action.edit': 'تعديل',
      'action.search': 'بحث',
      'action.filter': 'تصفية',
      'action.refresh': 'تحديث',
      'action.close': 'إغلاق',
      'action.confirm': 'تأكيد',
      'action.back': 'رجوع',
      'action.next': 'التالي',
      'status.loading': 'جاري التحميل...',
      'status.error': 'خطأ',
      'status.success': 'نجاح',
      'status.pending': 'معلق',
      'status.active': 'نشط',
      'status.inactive': 'غير نشط',
      'time.now': 'الآن',
      'time.minutes_ago': 'منذ {{count}} دقيقة',
      'time.hours_ago': 'منذ {{count}} ساعة',
      'time.days_ago': 'منذ {{count}} يوم'
    },
    // Hebrew (RTL)
    he: {
      'app.name': 'גלאי ארביטראז\'',
      'app.tagline': 'כלי ארביטראז\' מקצועי להימורים',
      'nav.dashboard': 'לוח מחוונים',
      'nav.opportunities': 'הזדמנויות',
      'nav.bets': 'ההימורים שלי',
      'nav.analytics': 'ניתוחים',
      'nav.settings': 'הגדרות',
      'action.save': 'שמור',
      'action.cancel': 'בטל',
      'action.delete': 'מחק',
      'action.edit': 'ערוך',
      'action.search': 'חפש',
      'action.filter': 'סנן',
      'action.refresh': 'רענן',
      'action.close': 'סגור',
      'action.confirm': 'אשר',
      'action.back': 'חזור',
      'action.next': 'הבא',
      'status.loading': 'טוען...',
      'status.error': 'שגיאה',
      'status.success': 'הצלחה',
      'status.pending': 'ממתין',
      'status.active': 'פעיל',
      'status.inactive': 'לא פעיל',
      'time.now': 'עכשיו',
      'time.minutes_ago': 'לפני {{count}} דקות',
      'time.hours_ago': 'לפני {{count}} שעות',
      'time.days_ago': 'לפני {{count}} ימים'
    }
  },
  
  // Opportunities namespace
  opportunities: {
    en: {
      'title': 'Arbitrage Opportunities',
      'subtitle': 'Live surebet and value betting opportunities',
      'filter.all_sports': 'All Sports',
      'filter.all_bookmakers': 'All Bookmakers',
      'filter.min_profit': 'Min Profit %',
      'filter.max_stake': 'Max Stake',
      'table.match': 'Match',
      'table.sport': 'Sport',
      'table.market': 'Market',
      'table.profit': 'Profit %',
      'table.bookmakers': 'Bookmakers',
      'table.time': 'Time',
      'table.actions': 'Actions',
      'detail.arbitrage': 'Arbitrage Details',
      'detail.stake_calculator': 'Stake Calculator',
      'detail.total_stake': 'Total Stake',
      'detail.total_return': 'Total Return',
      'detail.guaranteed_profit': 'Guaranteed Profit',
      'alert.high_value': 'High Value Opportunity',
      'alert.price_change': 'Price Changed',
      'empty.title': 'No opportunities found',
      'empty.subtitle': 'Try adjusting your filters or check back later'
    },
    fr: {
      'title': 'Opportunités d\'Arbitrage',
      'subtitle': 'Opportunités de surebet et value betting en direct',
      'filter.all_sports': 'Tous les Sports',
      'filter.all_bookmakers': 'Tous les Bookmakers',
      'filter.min_profit': 'Profit Min %',
      'filter.max_stake': 'Mise Max',
      'table.match': 'Match',
      'table.sport': 'Sport',
      'table.market': 'Marché',
      'table.profit': 'Profit %',
      'table.bookmakers': 'Bookmakers',
      'table.time': 'Heure',
      'table.actions': 'Actions',
      'detail.arbitrage': 'Détails de l\'Arbitrage',
      'detail.stake_calculator': 'Calculateur de Mise',
      'detail.total_stake': 'Mise Totale',
      'detail.total_return': 'Retour Total',
      'detail.guaranteed_profit': 'Profit Garanti',
      'alert.high_value': 'Opportunité de Haute Valeur',
      'alert.price_change': 'Prix Modifié',
      'empty.title': 'Aucune opportunité trouvée',
      'empty.subtitle': 'Essayez d\'ajuster vos filtres ou revenez plus tard'
    },
    es: {
      'title': 'Oportunidades de Arbitraje',
      'subtitle': 'Oportunidades de surebet y value betting en vivo',
      'filter.all_sports': 'Todos los Deportes',
      'filter.all_bookmakers': 'Todas las Casas',
      'filter.min_profit': 'Beneficio Mín %',
      'filter.max_stake': 'Apuesta Máx',
      'table.match': 'Partido',
      'table.sport': 'Deporte',
      'table.market': 'Mercado',
      'table.profit': 'Beneficio %',
      'table.bookmakers': 'Casas',
      'table.time': 'Hora',
      'table.actions': 'Acciones',
      'detail.arbitrage': 'Detalles del Arbitraje',
      'detail.stake_calculator': 'Calculadora de Apuesta',
      'detail.total_stake': 'Apuesta Total',
      'detail.total_return': 'Retorno Total',
      'detail.guaranteed_profit': 'Beneficio Garantizado',
      'alert.high_value': 'Oportunidad de Alto Valor',
      'alert.price_change': 'Precio Cambiado',
      'empty.title': 'No se encontraron oportunidades',
      'empty.subtitle': 'Intente ajustar sus filtros o vuelva más tarde'
    },
    de: {
      'title': 'Arbitrage-Möglichkeiten',
      'subtitle': 'Live Surebet- und Value-Betting-Möglichkeiten',
      'filter.all_sports': 'Alle Sportarten',
      'filter.all_bookmakers': 'Alle Buchmacher',
      'filter.min_profit': 'Min. Gewinn %',
      'filter.max_stake': 'Max. Einsatz',
      'table.match': 'Spiel',
      'table.sport': 'Sportart',
      'table.market': 'Markt',
      'table.profit': 'Gewinn %',
      'table.bookmakers': 'Buchmacher',
      'table.time': 'Zeit',
      'table.actions': 'Aktionen',
      'detail.arbitrage': 'Arbitrage-Details',
      'detail.stake_calculator': 'Einsatzrechner',
      'detail.total_stake': 'Gesamteinsatz',
      'detail.total_return': 'Gesamtgewinn',
      'detail.guaranteed_profit': 'Garantierter Gewinn',
      'alert.high_value': 'Hochwertige Möglichkeit',
      'alert.price_change': 'Preis geändert',
      'empty.title': 'Keine Möglichkeiten gefunden',
      'empty.subtitle': 'Versuchen Sie, Ihre Filter anzupassen oder kommen Sie später zurück'
    },
    // Arabic (RTL)
    ar: {
      'title': 'فرص المراجحة',
      'subtitle': 'فرص الرهان الآمن والقيمة المضافة المباشرة',
      'filter.all_sports': 'جميع الرياضات',
      'filter.all_bookmakers': 'جميع شركات الرهان',
      'filter.min_profit': 'الحد الأدنى للربح %',
      'filter.max_stake': 'الحد الأقصى للرهان',
      'table.match': 'المباراة',
      'table.sport': 'الرياضة',
      'table.market': 'السوق',
      'table.profit': 'الربح %',
      'table.bookmakers': 'شركات الرهان',
      'table.time': 'الوقت',
      'table.actions': 'الإجراءات',
      'detail.arbitrage': 'تفاصيل المراجحة',
      'detail.stake_calculator': 'حاسبة الرهان',
      'detail.total_stake': 'إجمالي الرهان',
      'detail.total_return': 'إجمالي العائد',
      'detail.guaranteed_profit': 'الربح المضمون',
      'alert.high_value': 'فرصة عالية القيمة',
      'alert.price_change': 'تغير السعر',
      'empty.title': 'لم يتم العثور على فرص',
      'empty.subtitle': 'حاول تعديل عوامل التصفية أو تحقق لاحقًا'
    },
    // Hebrew (RTL)
    he: {
      'title': 'הזדמנויות ארביטראז\'',
      'subtitle': 'הזדמנויות ארביטראז\' וווליו בטינג חיות',
      'filter.all_sports': 'כל הספורט',
      'filter.all_bookmakers': 'כל ה bookmakers',
      'filter.min_profit': 'רווח מינימלי %',
      'filter.max_stake': 'הימור מקסימלי',
      'table.match': 'משחק',
      'table.sport': 'ספורט',
      'table.market': 'שוק',
      'table.profit': 'רווח %',
      'table.bookmakers': 'Bookmakers',
      'table.time': 'שעה',
      'table.actions': 'פעולות',
      'detail.arbitrage': 'פרטי ארביטראז\'',
      'detail.stake_calculator': 'מחשבון הימור',
      'detail.total_stake': 'סכום הימור כולל',
      'detail.total_return': 'תשואה כוללת',
      'detail.guaranteed_profit': 'רווח מובטח',
      'alert.high_value': 'הזדמנות בעלת ערך גבוה',
      'alert.price_change': 'מחיר השתנה',
      'empty.title': 'לא נמצאו הזדמנויות',
      'empty.subtitle': 'נסה להתאים את המסננים או בדוק שוב מאוחר יותר'
    }
  },

  // Betting namespace
  betting: {
    en: {
      'title': 'My Bets',
      'tabs.active': 'Active',
      'tabs.settled': 'Settled',
      'tabs.pending': 'Pending',
      'stake.label': 'Stake',
      'odds.label': 'Odds',
      'profit.label': 'Profit',
      'loss.label': 'Loss',
      'status.won': 'Won',
      'status.lost': 'Lost',
      'status.void': 'Void',
      'status.placed': 'Placed',
      'calculator.title': 'Bet Calculator',
      'calculator.stake': 'Enter Stake',
      'calculator.odds': 'Enter Odds',
      'calculator.profit': 'Potential Profit',
      'calculator.return': 'Total Return'
    },
    fr: {
      'title': 'Mes Paris',
      'tabs.active': 'Actifs',
      'tabs.settled': 'Réglés',
      'tabs.pending': 'En Attente',
      'stake.label': 'Mise',
      'odds.label': 'Cotes',
      'profit.label': 'Profit',
      'loss.label': 'Perte',
      'status.won': 'Gagné',
      'status.lost': 'Perdu',
      'status.void': 'Annulé',
      'status.placed': 'Placé',
      'calculator.title': 'Calculateur de Paris',
      'calculator.stake': 'Entrer la Mise',
      'calculator.odds': 'Entrer les Cotes',
      'calculator.profit': 'Profit Potentiel',
      'calculator.return': 'Retour Total'
    },
    es: {
      'title': 'Mis Apuestas',
      'tabs.active': 'Activas',
      'tabs.settled': 'Resueltas',
      'tabs.pending': 'Pendientes',
      'stake.label': 'Apuesta',
      'odds.label': 'Cuotas',
      'profit.label': 'Beneficio',
      'loss.label': 'Pérdida',
      'status.won': 'Ganada',
      'status.lost': 'Perdida',
      'status.void': 'Nula',
      'status.placed': 'Colocada',
      'calculator.title': 'Calculadora de Apuestas',
      'calculator.stake': 'Ingrese Apuesta',
      'calculator.odds': 'Ingrese Cuotas',
      'calculator.profit': 'Beneficio Potencial',
      'calculator.return': 'Retorno Total'
    },
    de: {
      'title': 'Meine Wetten',
      'tabs.active': 'Aktiv',
      'tabs.settled': 'Abgerechnet',
      'tabs.pending': 'Ausstehend',
      'stake.label': 'Einsatz',
      'odds.label': 'Quote',
      'profit.label': 'Gewinn',
      'loss.label': 'Verlust',
      'status.won': 'Gewonnen',
      'status.lost': 'Verloren',
      'status.void': 'Ungültig',
      'status.placed': 'Platziert',
      'calculator.title': 'Wettenrechner',
      'calculator.stake': 'Einsatz eingeben',
      'calculator.odds': 'Quote eingeben',
      'calculator.profit': 'Möglicher Gewinn',
      'calculator.return': 'Gesamtgewinn'
    },
    // Arabic (RTL)
    ar: {
      'title': 'رهاناتي',
      'tabs.active': 'نشط',
      'tabs.settled': 'مستقر',
      'tabs.pending': 'معلق',
      'stake.label': 'الرهان',
      'odds.label': 'الاحتمالات',
      'profit.label': 'الربح',
      'loss.label': 'الخسارة',
      'status.won': 'فاز',
      'status.lost': 'خسر',
      'status.void': 'ملغى',
      'status.placed': 'موضوع',
      'calculator.title': 'حاسبة الرهان',
      'calculator.stake': 'أدخل الرهان',
      'calculator.odds': 'أدخل الاحتمالات',
      'calculator.profit': 'الربح المحتمل',
      'calculator.return': 'العائد الإجمالي'
    },
    // Hebrew (RTL)
    he: {
      'title': 'ההימורים שלי',
      'tabs.active': 'פעיל',
      'tabs.settled': 'סופי',
      'tabs.pending': 'ממתין',
      'stake.label': 'הימור',
      'odds.label': 'יחסי הימור',
      'profit.label': 'רווח',
      'loss.label': 'הפסד',
      'status.won': 'ניצח',
      'status.lost': 'הפסיד',
      'status.void': 'בוטל',
      'status.placed': 'הוצב',
      'calculator.title': 'מחשבון הימורים',
      'calculator.stake': 'הזן סכום הימור',
      'calculator.odds': 'הזן יחסי הימור',
      'calculator.profit': 'רווח פוטנציאלי',
      'calculator.return': 'תשואה כוללת'
    }
  }
};

async function seed() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/surebet_i18n';
  
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    let totalInserted = 0;
    
    for (const [namespace, languages] of Object.entries(translations)) {
      for (const [language, keys] of Object.entries(languages)) {
        const operations = Object.entries(keys).map(([key, value]) => ({
          updateOne: {
            filter: { key, namespace, language },
            update: {
              $set: {
                value,
                'metadata.source': 'seed',
                'metadata.verified': true
              }
            },
            upsert: true
          }
        }));
        
        if (operations.length > 0) {
          const result = await Translation.bulkWrite(operations);
          totalInserted += result.upsertedCount || 0;
          console.log(`Seeded ${language}/${namespace}: ${operations.length} translations`);
        }
      }
    }
    
    console.log(`\nSeeding complete! Total inserted: ${totalInserted}`);
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
