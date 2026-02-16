# Tax Reporting System

## Overview
The Tax Reporting System generates tax-friendly reports in CSV and Excel formats for sports betting activity. It provides detailed transaction history, summaries by bookmaker and sport, and profit/loss calculations.

## Features

### Report Formats
- **CSV**: Plain text format suitable for importing into tax software
- **Excel (.xls)**: Formatted HTML table that opens in Excel with styling

### Report Contents

#### Detailed Bet History
- Date of bet
- Event name and sport
- Bookmaker
- Selection/outcome
- Odds
- Stake (in EUR and local currency)
- Result (Win/Loss/Pending)
- Profit/Loss (in EUR and local currency)
- Exchange rate
- Notes

#### Summary Statistics
- Total number of bets
- Winning bets count
- Losing bets count
- Total stakes
- Total profit/loss
- ROI percentage

#### Breakdowns
- **By Bookmaker**: Performance metrics per bookmaker
- **By Sport**: Performance metrics per sport

## API Endpoints

### GET `/api/reports`
List all generated reports.

**Response:**
```json
[
  {
    "filename": "tax-report-2025-01-01-to-2025-12-31.csv",
    "path": "/data/reports/tax-report-2025-01-01-to-2025-12-31.csv",
    "created": "2026-02-17T07:30:00Z"
  }
]
```

### POST `/api/reports/generate`
Generate a new report.

**Request Body:**
```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-12-31",
  "format": "csv"
}
```

**Response:**
```json
{
  "success": true,
  "filepath": "/data/reports/tax-report-2025-01-01-to-2025-12-31.csv",
  "filename": "tax-report-2025-01-01-to-2025-12-31.csv"
}
```

### GET `/api/reports/download/:filename`
Download a generated report file.

## Web Dashboard

### Report Generation UI
- Date range picker (start and end dates)
- Format selector (CSV or Excel)
- Generate button with loading state
- List of previously generated reports with download links

### Usage
1. Navigate to the "Tax Reports" section
2. Select date range
3. Choose format (CSV for tax software, Excel for viewing)
4. Click "Generate Report"
5. File will automatically download

## Data Structure

### Bet Object
```javascript
{
  date: "2025-06-15T14:30:00Z",
  event: "Wimbledon Final: Alcaraz vs Djokovic",
  sport: "tennis",
  bookmaker: "Unibet",
  betType: "Single",
  selection: "Alcaraz to win",
  outcome: "Alcaraz",
  odds: 2.5,
  stake: 100,
  stakeEUR: 100,
  stakeLocal: 100,
  currency: "EUR",
  result: "Win",
  profitLossEUR: 150,
  profitLossLocal: 150,
  exchangeRate: 1,
  notes: "+EV opportunity detected"
}
```

## File Locations

### Reports Directory
```
data/reports/
├── tax-report-2025-01-01-to-2025-12-31.csv
├── tax-report-2025-01-01-to-2025-12-31.xls
└── ...
```

### Source Files
- `src/tax-exporter.js` - Core tax export functionality
- `src/web/server.js` - API endpoints
- `web/index.html` - Report generation UI
- `web/public/app.js` - Frontend report handling

## CSV Format

The CSV file includes:
1. Header row with column names
2. One row per bet transaction
3. Summary section at the end
4. Bookmaker breakdown
5. Sport breakdown

### Sample CSV Structure
```csv
Date,Event,Sport,Bookmaker,Bet Type,Selection,Odds,Stake (EUR),...
2025-06-15,Wimbledon Final,tennis,Unibet,Single,Alcaraz,2.5,100,...
...

SUMMARY
Total Bets,150
Winning Bets,85
Losing Bets,65
Total Stakes (EUR),15000.00
Total Profit/Loss (EUR),1250.50
ROI (%),8.34

BY BOOKMAKER
Bookmaker,Bets,Total Stake,Profit/Loss,ROI
Unibet,50,5000.00,450.25,9.01
...

BY SPORT
Sport,Bets,Total Stake,Profit/Loss,ROI
tennis,80,8000.00,890.50,11.13
...
```

## Excel Format

The Excel file is an HTML table with:
- Professional styling with colors
- Summary section with key metrics
- Detailed bet history table
- Bookmaker performance breakdown
- Sport performance breakdown
- Disclaimer footer

## Tax Compliance Notes

### EUR Currency
All reports convert amounts to EUR for consistency. Local currency amounts are preserved for reference.

### Exchange Rates
Exchange rates are recorded at the time of bet placement for accurate EUR conversion.

### Pending Bets
Bets with "Pending" result are included but marked separately. Final tax reports should only include settled bets.

### Disclaimer
Reports include a disclaimer noting they are for informational purposes and users should consult tax professionals.

## Future Enhancements
- PDF report generation
- Quarterly/annual auto-generation
- Direct tax software integration (e.g., TurboTax, H&R Block)
- Multi-currency support with historical exchange rates
- Tax jurisdiction-specific report formats
- Capital gains vs income classification
- Loss carryforward tracking
