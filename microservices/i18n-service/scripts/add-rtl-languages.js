/**
 * Migration script to add RTL languages to the i18n service
 * Run with: node scripts/add-rtl-languages.js
 */

const mongoose = require('mongoose');
const Language = require('../src/models/Language');

const rtlLanguages = [
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    flag: '🇸🇦',
    rtl: true,
    enabled: true,
    metadata: {
      locale: 'ar-SA',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: 'HH:mm',
      currency: 'SAR',
      numberFormat: {
        decimalSeparator: '.',
        thousandSeparator: ','
      }
    }
  },
  {
    code: 'he',
    name: 'Hebrew',
    nativeName: 'עברית',
    flag: '🇮🇱',
    rtl: true,
    enabled: true,
    metadata: {
      locale: 'he-IL',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: 'HH:mm',
      currency: 'ILS',
      numberFormat: {
        decimalSeparator: '.',
        thousandSeparator: ','
      }
    }
  }
];

async function migrate() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/surebet_i18n';
  
  try {
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    for (const lang of rtlLanguages) {
      const existing = await Language.findOne({ code: lang.code });
      
      if (existing) {
        console.log(`Language ${lang.code} already exists, updating...`);
        await Language.updateOne({ code: lang.code }, { $set: lang });
      } else {
        console.log(`Creating language: ${lang.code} (${lang.nativeName})`);
        await Language.create(lang);
      }
    }
    
    // Update existing languages to ensure rtl field exists
    await Language.updateMany(
      { rtl: { $exists: false } },
      { $set: { rtl: false } }
    );
    
    console.log('\nMigration complete!');
    console.log('Added RTL languages: Arabic (ar), Hebrew (he)');
    
    // List all languages
    const allLanguages = await Language.find().sort({ code: 1 });
    console.log('\nAll languages:');
    allLanguages.forEach(lang => {
      console.log(`  ${lang.code}: ${lang.nativeName} ${lang.rtl ? '(RTL)' : '(LTR)'}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
