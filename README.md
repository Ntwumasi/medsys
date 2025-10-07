# MedSys - Outpatient Electronic Medical Record (EMR) System

A comprehensive, mobile-friendly EMR system designed for outpatient clinics and private practices. Built with React, TypeScript, Node.js, Express, and PostgreSQL.

## Features

### Core Clinical Components
- **Patient Demographics & Information Management**
  - Comprehensive patient registration
  - Patient search and management
  - Demographics, contact info, insurance details

- **Medical History & Charting**
  - Presenting complaints
  - History of present illness
  - Past medical and surgical history
  - Allergies and adverse drug reactions
  - Medication lists
  - Immunization history
  - Family history
  - Social history
  - Vital signs tracking
  - Physical examination notes
  - Lab and radiology results
  - Treatment plans and diagnoses
  - **Easily accessible summary of previous visits**

- **Clinical Decision Support**
  - Drug-to-drug interaction warnings
  - Medication dosing guidance
  - Allergy checking

- **e-Prescribing & Medication Management**
  - Electronic prescription creation
  - Medication history tracking
  - Active medication management
  - Drug interaction checking

- **Order Entry**
  - Lab test ordering
  - Imaging study requests
  - Referral management

### Administrative Components
- **Patient Scheduling**
  - Appointment booking and management
  - Appointment reminders
  - Today's appointments view

- **Billing & Revenue Cycle Management**
  - Invoice generation
  - Payment tracking
  - Financial reporting

- **Reporting & Analytics**
  - Clinical outcome tracking
  - Practice management reports

### Patient & Provider Engagement
- **Patient Portal** (Planned)
  - Access to health records
  - Online appointment booking
  - Secure messaging
  - Online bill payment

- **Secure Messaging**
  - HIPAA-compliant communication
  - Provider-to-provider messaging

- **Telehealth Integration** (Planned)
  - Virtual visit support
  - Remote consultations

### Technical Features
- **Security & Compliance**
  - Role-based access control
  - Data encryption
  - Audit trails
  - HIPAA-compliant design

- **Mobile Accessibility**
  - Responsive, mobile-first design
  - Progressive Web App (PWA) ready
  - Works on desktop, tablet, and smartphone

- **Interoperability** (Planned)
  - Data exchange capabilities
  - Integration with external systems

## Tech Stack

### Frontend
- React 19
- TypeScript
- React Router
- Tailwind CSS
- Axios
- date-fns

### Backend
- Node.js
- Express
- TypeScript
- PostgreSQL
- JWT Authentication
- bcrypt

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- npm or yarn

## Installation & Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd medsys
```

### 2. Database Setup

Install PostgreSQL and create a database:

```bash
psql -U postgres
CREATE DATABASE medsys;
\q
```

### 3. Server Setup

```bash
cd server

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Edit .env and configure your database credentials
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=medsys
# DB_USER=postgres
# DB_PASSWORD=your_password_here
# JWT_SECRET=your-super-secret-jwt-key

# Set up database tables
npm run db:setup

# Start development server
npm run dev
```

The server will start on http://localhost:5000

### 4. Client Setup

```bash
cd client

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Edit .env if needed (default API URL is http://localhost:5000/api)

# Start development server
npm run dev
```

The client will start on http://localhost:5173

## Default Credentials

After setting up the database, you'll need to create an admin user. You can do this by:

1. Making a POST request to `/api/auth/register` with:
```json
{
  "email": "admin@example.com",
  "password": "admin123",
  "role": "admin",
  "first_name": "Admin",
  "last_name": "User",
  "phone": "+1234567890"
}
```

2. Or using curl:
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123",
    "role": "admin",
    "first_name": "Admin",
    "last_name": "User"
  }'
```

Then login with:
- Email: admin@example.com
- Password: admin123

## User Roles

The system supports the following roles:
- **admin**: Full system access
- **doctor**: Clinical access, prescribing, charting
- **nurse**: Clinical support, vital signs, medication administration
- **receptionist**: Patient registration, scheduling, billing
- **patient**: Patient portal access (planned)

## API Endpoints

### Authentication
- POST `/api/auth/register` - Register new user
- POST `/api/auth/login` - Login
- GET `/api/auth/me` - Get current user

### Patients
- GET `/api/patients` - List patients
- GET `/api/patients/:id` - Get patient details
- GET `/api/patients/:id/summary` - Get patient summary with encounters, medications, allergies
- POST `/api/patients` - Create patient
- PUT `/api/patients/:id` - Update patient

### Encounters
- GET `/api/encounters` - List encounters
- GET `/api/encounters/:id` - Get encounter details
- POST `/api/encounters` - Create encounter
- PUT `/api/encounters/:id` - Update encounter
- POST `/api/encounters/diagnoses` - Add diagnosis

### Appointments
- GET `/api/appointments` - List appointments
- GET `/api/appointments/today` - Today's appointments
- POST `/api/appointments` - Create appointment
- PUT `/api/appointments/:id` - Update appointment
- POST `/api/appointments/:id/cancel` - Cancel appointment

### Medications
- GET `/api/medications/patient/:patient_id` - Get patient medications
- POST `/api/medications` - Prescribe medication
- PUT `/api/medications/:id` - Update medication
- POST `/api/medications/:id/discontinue` - Discontinue medication
- POST `/api/medications/check-allergies` - Check for allergies

## Development

### Running Tests
```bash
# Server tests
cd server
npm test

# Client tests
cd client
npm test
```

### Building for Production

```bash
# Build server
cd server
npm run build
npm start

# Build client
cd client
npm run build
npm run preview
```

## Project Structure

```
medsys/
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/           # API client functions
│   │   ├── components/    # Reusable components
│   │   ├── context/       # React context (Auth)
│   │   ├── pages/         # Page components
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utility functions
│   └── public/            # Static assets
│
└── server/                # Node.js backend
    ├── src/
    │   ├── controllers/   # Request handlers
    │   ├── database/      # Database config & setup
    │   ├── middleware/    # Express middleware
    │   ├── routes/        # API routes
    │   ├── types/         # TypeScript types
    │   └── utils/         # Utility functions
    └── dist/              # Compiled JavaScript
```

## Security Considerations

- All passwords are hashed using bcrypt
- JWT tokens for authentication
- Role-based access control
- SQL injection protection via parameterized queries
- CORS enabled with appropriate configuration
- Environment variables for sensitive data

## Future Enhancements

- [ ] Patient Portal with self-service features
- [ ] Telehealth video integration
- [ ] Advanced reporting and analytics dashboard
- [ ] HL7/FHIR integration for interoperability
- [ ] Mobile apps (iOS/Android)
- [ ] E-prescription integration with pharmacies
- [ ] Lab system integration
- [ ] Document management system
- [ ] Advanced clinical decision support
- [ ] Automated appointment reminders (SMS/Email)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For support, email support@medsys.com or open an issue in the repository.
