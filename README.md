# B2B Marketplace Platform 🚀

A modern, professional B2B Marketplace Platform built with a scalable monolithic-repo architecture. This project features a robust **NestJS** backend and a dynamic **Next.js** frontend.

## 🏗️ Architecture & Tech Stack

The project is organized as a monorepo for easier management and deployment.

- **Frontend**: [Next.js](https://nextjs.org/) (React, TypeScript, Tailwind CSS)
- **Backend**: [NestJS](https://nestjs.com/) (Node.js, TypeScript, PostgreSQL, Prisma ORM)
- **Database**: PostgreSQL (Containerized via Docker)
- **Communication**: RESTful API with structured interceptors and error handling.

## ✨ Key Features

- **Product Management**: Robust system for handling categories, placements, and bulk uploads.
- **User Authentication**: Secure auth flow using NextAuth.
- **Internationalization**: Support for multi-currency and translations.
- **Responsive Dashboard**: Beautiful Sidebar and navigation tailored for B2B operations.
- **Deployment Ready**: Configured for Vercel, Render, and high-performance environments.

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18 or later
- **Docker**: For PostgreSQL database
- **npm** or **yarn**

### 2. Installation
Clone the repository and install dependencies from the root:
```bash
git clone https://github.com/Abdelrhman7558/MarketPlace.git
cd MarketPlace
npm run install:all
```

### 3. Environment Setup
Create a `.env` file in both `frontend` and `backend` directories based on the `.env.example` templates.

### 4. Database Setup
Ensure Docker is running and execute:
```bash
docker-compose up -d postgres
npm run db:push
```

### 5. Running the Application
To start both the frontend and backend in development mode:
```bash
npm run dev
```
- **Frontend**: `http://localhost:3000`
- **Backend**: `http://localhost:3001`

## 🛠️ Scripts

- `npm run dev`: Starts both frontend and backend concurrently.
- `npm run install:all`: Installs all dependencies across the monorepo.
- `npm run db:push`: Pushes Prisma schema to the database.
- `npm run build`: Full production build of the entire project.

## 📄 License

[MIT](LICENSE) (or your preferred license)
# MarketPlace-Final
# MarketPlace-main
