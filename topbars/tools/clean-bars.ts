/**
 * CLEAN BARS - Normalize bar text in test result JSONs
 *
 * Applies:
 * - Remove quotes
 * - Remove punctuation (except commas)
 * - Lowercase (except brand names/proper nouns)
 *
 * Usage: npx tsx tools/clean-bars.ts <json-file>
 */

import * as fs from 'fs';

// Brand names and proper nouns to preserve capitalization
const PRESERVE_CAPS = new Set([
  // Tech brands
  'iPhone', 'iPad', 'Apple', 'Google', 'Netflix', 'Spotify', 'Amazon', 'Tesla',
  'PlayStation', 'Xbox', 'Nintendo', 'Switch', 'Wii', 'GameBoy',
  'Windows', 'Mac', 'MacBook', 'Android', 'Samsung', 'TikTok', 'Instagram',
  'Facebook', 'Twitter', 'Snapchat', 'YouTube', 'Twitch', 'Discord',
  'Uber', 'Lyft', 'DoorDash', 'Grubhub', 'Venmo', 'PayPal', 'Cash App',
  'Wi-Fi', 'WiFi', 'Bluetooth', 'USB', 'HDMI', 'iMessage', 'FaceTime',
  'Kindle', 'Alexa', 'Siri', 'ChatGPT', 'AI',

  // Cars
  'BMW', 'Mercedes', 'Benz', 'Porsche', 'Ferrari', 'Lamborghini', 'Lambo',
  'Tesla', 'Audi', 'Lexus', 'Rolls', 'Royce', 'Bentley', 'Maybach',
  'Honda', 'Toyota', 'Nissan', 'Ford', 'Chevy', 'Chevrolet', 'Dodge',

  // Fashion
  'Gucci', 'Louis', 'Vuitton', 'LV', 'Prada', 'Chanel', 'Dior', 'Versace',
  'Balenciaga', 'Nike', 'Adidas', 'Jordan', 'Jordans', 'Yeezy', 'Supreme',
  'Rolex', 'Cartier', 'AP', 'Patek', 'Richard Mille',

  // Food/Drinks
  'McDonald\'s', 'McDonalds', 'Starbucks', 'Dunkin', 'Chick-fil-A',
  'Hennessy', 'Henny', 'Ciroc', 'Patron', 'Dom', 'Perignon', 'Ace',

  // Characters/Shows/Games
  'Garfield', 'SpongeBob', 'Spongebob', 'Patrick', 'Squidward',
  'Pikachu', 'Pokemon', 'Pokémon', 'Mario', 'Luigi', 'Zelda', 'Link',
  'GTA', 'Fortnite', 'Minecraft', 'Roblox', 'Call of Duty', 'COD',
  'Casper', 'Snorlax', 'Thanos', 'Batman', 'Superman', 'Joker',
  'Drake', 'Kanye', 'Ye', 'Jay-Z', 'Beyonce', 'Beyoncé', 'Rihanna',
  'Cinderella', 'Disney', 'Pixar', 'Marvel', 'DC', 'Ferb', 'Phineas',
  'Odell', 'Beckham', 'LeBron', 'Jordan', 'Kobe', 'Curry', 'Brady',
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',

  // Places
  'LA', 'NYC', 'Miami', 'Atlanta', 'ATL', 'Houston', 'Chicago',
  'Hollywood', 'Vegas', 'Brooklyn', 'Compton', 'Bronx',

  // Other
  'MySpace', 'AOL', 'Java', 'Python', 'API', 'GPS', 'ATM', 'VIP',
  'DNA', 'FBI', 'CIA', 'IRS', 'NBA', 'NFL', 'MLB', 'MLS',
  'Grammy', 'Oscar', 'Emmy', 'BET', 'MTV',
]);

// Build regex pattern for case-insensitive matching
const preservePattern = new RegExp(
  `\\b(${Array.from(PRESERVE_CAPS).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'gi'
);

/**
 * Clean a single bar text
 */
export function cleanBarText(text: string): string {
  // Step 1: Remove surrounding quotes (all types)
  let cleaned = text.replace(/^["'"'"«»„"]+|["'"'"«»„"]+$/g, '');

  // Step 2: Replace dashes with comma+space (to preserve separation)
  cleaned = cleaned.replace(/\s*[—–-]{1,2}\s*/g, ', ');

  // Step 3: Remove other punctuation (keep commas, apostrophes in contractions)
  cleaned = cleaned
    .replace(/[.!?;:""„""«»]+/g, '')  // Remove these punctuation marks
    .replace(/["']/g, '')              // Remove quotes
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .replace(/,\s*,/g, ',')            // Remove double commas
    .replace(/^,\s*|\s*,$/g, '')       // Remove leading/trailing commas
    .trim();

  // Step 4: Lowercase everything
  cleaned = cleaned.toLowerCase();

  // Step 5: Restore capitalization for preserved words
  cleaned = cleaned.replace(preservePattern, (match) => {
    // Find the correct casing from our set
    for (const word of PRESERVE_CAPS) {
      if (word.toLowerCase() === match.toLowerCase()) {
        return word;
      }
    }
    return match;
  });

  // Step 6: Capitalize "I" as standalone word
  cleaned = cleaned.replace(/\bi\b/g, 'I');

  return cleaned;
}

/**
 * Parse output and extract/clean individual bars
 */
function parseAndCleanOutput(output: string): string {
  const lines = output.split('\n');
  const cleanedLines: string[] = [];

  for (const line of lines) {
    // Check if this is a BAR line
    const barMatch = line.match(/^BAR \d+:\s*(.+)$/);
    if (barMatch) {
      const barText = barMatch[1].trim();
      const cleanedBar = cleanBarText(barText);
      cleanedLines.push(`BAR ${line.match(/BAR (\d+)/)?.[1]}: ${cleanedBar}`);
    } else {
      // Keep non-bar lines as-is (Technique, Why, INPUT)
      cleanedLines.push(line);
    }
  }

  return cleanedLines.join('\n');
}

/**
 * Process a test results JSON file
 */
function processFile(inputPath: string): void {
  console.log(`Processing: ${inputPath}`);

  const content = fs.readFileSync(inputPath, 'utf-8');
  const results = JSON.parse(content);

  let cleaned = 0;
  for (const result of results) {
    if (result.output && !result.error) {
      const before = result.output;
      result.output = parseAndCleanOutput(result.output);
      if (before !== result.output) cleaned++;
    }
  }

  fs.writeFileSync(inputPath, JSON.stringify(results, null, 2));
  console.log(`Cleaned ${cleaned} outputs in ${inputPath}`);
}

// Main
const inputFile = process.argv[2];
if (!inputFile) {
  console.log('Usage: npx tsx tools/clean-bars.ts <json-file>');
  console.log('Example: npx tsx tools/clean-bars.ts test-results/bar-writer-test-*.json');
  process.exit(1);
}

processFile(inputFile);
