/**
 * Generate PWA icons using sharp
 * Run: node generate-icons.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const iconsDir = path.join(__dirname, 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// Create a simple SVG with the chart emoji
const svgBuffer = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f172a" rx="64"/>
  <svg x="106" y="106" width="300" height="300" viewBox="0 0 100 100">
    <rect x="10" y="60" width="15" height="30" fill="#22c55e" rx="2"/>
    <rect x="30" y="40" width="15" height="50" fill="#22c55e" rx="2"/>
    <rect x="50" y="20" width="15" height="70" fill="#22c55e" rx="2"/>
    <rect x="70" y="35" width="15" height="55" fill="#22c55e" rx="2"/>
    <path d="M 15 55 L 37 35 L 57 15 L 77 30" stroke="#22c55e" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="77" cy="30" r="5" fill="#22c55e"/>
  </svg>
</svg>
`);

async function generateIcons() {
    console.log('Generating PWA icons...');
    
    for (const size of sizes) {
        const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
        
        try {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(outputPath);
            
            console.log(`✓ Created icon-${size}x${size}.png`);
        } catch (error) {
            console.error(`✗ Failed to create icon-${size}x${size}.png:`, error.message);
        }
    }
    
    // Also create a maskable version (with padding for safe zone)
    const maskableSvg = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="#0f172a"/>
      <svg x="156" y="156" width="200" height="200" viewBox="0 0 100 100">
        <rect x="10" y="60" width="15" height="30" fill="#22c55e" rx="2"/>
        <rect x="30" y="40" width="15" height="50" fill="#22c55e" rx="2"/>
        <rect x="50" y="20" width="15" height="70" fill="#22c55e" rx="2"/>
        <rect x="70" y="35" width="15" height="55" fill="#22c55e" rx="2"/>
        <path d="M 15 55 L 37 35 L 57 15 L 77 30" stroke="#22c55e" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="77" cy="30" r="5" fill="#22c55e"/>
      </svg>
    </svg>
    `);
    
    try {
        await sharp(maskableSvg)
            .resize(192, 192)
            .png()
            .toFile(path.join(iconsDir, 'icon-maskable.png'));
        console.log('✓ Created icon-maskable.png');
    } catch (error) {
        console.error('✗ Failed to create maskable icon:', error.message);
    }
    
    console.log('\\nIcon generation complete!');
}

generateIcons().catch(console.error);
