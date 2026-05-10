# LoanTrack - Professional Loan Management System

A modern, secure loan tracking and management application built with React and Supabase. Track loans, manage borrowers, and send WhatsApp reminders with ease.

## Features

✅ **Borrower Management** - Add, edit, and delete borrower records
✅ **Multi-image Support** - Upload two profile images for each borrower
✅ **Account Tracking** - Track account numbers and residency information
✅ **Currency Support** - South African Rand (ZAR) formatting
✅ **Phone Formatting** - Automatic South African phone number formatting
✅ **Loan Tracking** - Monitor active, overdue, and paid loans
✅ **WhatsApp Integration** - Send payment reminders directly via WhatsApp
✅ **Role-based Access** - Admin and Viewer roles with PIN protection
✅ **Real-time Updates** - Instant synchronization with Supabase

## Prerequisites

- Node.js 16+ and npm
- Supabase account (free tier available at https://supabase.co)
- React 19.x

## Setup Instructions

### 1. Clone or Download the Project

```bash
cd loan-tracker
npm install
```

### 2. Configure Supabase

1. Create a Supabase project at https://supabase.co
2. Create a table named `loans` with the following columns:
   - `id` (UUID, primary key)
   - `borrower_name` (text)
   - `phone` (text)
   - `account_number` (text)
   - `residency_place` (text)
   - `amount` (numeric)
   - `loan_date` (date)
   - `due_date` (date)
   - `notes` (text, nullable)
   - `status` (text: 'active' or 'paid')
   - `image1` (text, nullable - stores base64)
   - `image2` (text, nullable - stores base64)
   - `created_at` (timestamp)

3. Copy your Supabase URL and Public API Key

### 3. Environment Variables

Create a `.env.local` file in the project root:

```env
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_KEY=your_public_api_key_here
```

Or copy from `.env.example`:
```bash
cp .env.example .env.local
```

### 4. Run Locally

```bash
npm start
```

Visit http://localhost:3000

**Default Credentials:**
- Admin PIN: `1234` (change in App.js line where `ADMIN_PIN` is defined)

## Deployment to Vercel

### 1. Prepare for Deployment

```bash
npm run build
```

### 2. Deploy to Vercel

**Option A: CLI (Recommended)**
```bash
npm i -g vercel
vercel
```

**Option B: GitHub Integration**
1. Push your code to GitHub
2. Connect your repo to Vercel at https://vercel.com
3. Add environment variables in Vercel dashboard

### 3. Set Environment Variables on Vercel

In your Vercel project settings:
1. Go to **Settings** → **Environment Variables**
2. Add:
   - Key: `REACT_APP_SUPABASE_URL` → Value: Your Supabase URL
   - Key: `REACT_APP_SUPABASE_KEY` → Value: Your Supabase Key

### 4. Deploy

```bash
vercel --prod
```

## Project Structure

```
loan-tracker/
├── src/
│   ├── App.js (Main application)
│   ├── App.css
│   ├── index.js
│   └── ...
├── public/
├── package.json
├── vercel.json (Deployment config)
├── .env.example (Environment template)
└── README.md
```

## Key Changes in Latest Update

### Currency
- Changed from Nigerian Naira (NGN) to South African Rand (ZAR)
- All amounts now display in ZAR format

### Phone Formatting
- Automatic formatting of South African phone numbers
- Supports formats: 0XXXXXXXXX, 27XXXXXXXXX, +27XXXXXXXXX
- Displays as: +27 XXX XXX XXXX

### New Borrower Fields
- **Account Number**: Bank account for loan repayment
- **Residency Place**: City or area where borrower resides
- **Image 1 & 2**: Two profile images stored as base64

### Date Formatting
- Updated to South African date format (en-ZA)

## Usage

### Admin Functions
- Add new loans with complete borrower details
- Edit existing loan records
- Delete loans (with confirmation)
- Mark loans as paid
- Send WhatsApp payment reminders
- Upload and manage borrower images

### Viewer Functions
- View all loans and borrower information
- Filter by status (Active, Overdue, Paid)
- Search by name or phone number
- Send WhatsApp reminders
- Mark loans as paid

## WhatsApp Integration

The app uses WhatsApp Web API to send reminders. When you click "Remind":
1. A pre-formatted message is generated
2. Your default WhatsApp chat opens
3. Adjust if needed and send manually

**Message includes:**
- Borrower name
- Loan amount
- Due date
- Reference/notes

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Security Notes

⚠️ **Important:**
- Change the default admin PIN immediately
- Keep Supabase API keys confidential
- Use HTTPS in production (Vercel provides this)
- Never commit `.env.local` to git
- Review Supabase Row Level Security settings

## Troubleshooting

### Images not saving
- Ensure your browser supports FileReader API
- Check browser console for errors
- Verify Supabase table has image columns

### WhatsApp link not opening
- Ensure phone numbers are in correct format
- Check if WhatsApp is installed on your device
- Try opening in WhatsApp Web if on desktop

### Login issues
- Clear browser cookies/cache
- Verify admin PIN is correct
- Check browser console for errors

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Supabase documentation: https://supabase.io/docs
3. Check React documentation: https://react.dev

## License

This project is private and proprietary.

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
