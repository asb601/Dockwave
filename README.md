# 🚀 **IntelliDoc AI**

**AI-powered document intelligence platform** that enables users to store, organize, analyze, and chat with their documents using advanced Retrieval-Augmented Generation (RAG) architecture.

---

## 🌟 **Overview**

**IntelliDoc AI transforms how professionals work with documents by combining:**

- 📄 Intelligent document storage  
- 🧠 AI-powered contextual chat  
- 🔎 Smart semantic search  
- 📅 Calendar & task integration  
- 🔐 Secure multi-user architecture  

The system leverages **Next.js + FastAPI + Graph RAG + Prisma** to deliver a scalable, production-style document intelligence solution.

---

# 🏗 **System Architecture**







---

# 🧠 **Core Features**

## 1️⃣ **AI Analysis**
- Extract summaries from uploaded documents  
- Context-aware Q&A over entire workspace  
- Folder-level and file-level context selection  
- Graph-based retrieval for improved reasoning  

---

## 2️⃣ **Smart Search**
- Semantic search across all user documents  
- Fast retrieval using vector embeddings  
- Context filtering (workspace / folder / file)  

---

## 3️⃣ **Document Management**
- Folder organization  
- File storage  
- Prisma-backed database integration  
- Ingestion & update pipeline  

---

## 4️⃣ **Collaboration**
- Multi-user architecture  
- Shared access capabilities  
- Role-based document interactions  

---

## 5️⃣ **Calendar & Task Management API**

Integrated calendar system with full CRUD support.

### 📅 **Events**
- `GET /api/calendar/events`
- `POST /api/calendar/events`
- `PATCH /api/calendar/events`
- `DELETE /api/calendar/events`

### ✅ **Tasks**
- Create, update, delete tasks  
- Due dates & priority management  

### 🔁 **Recurring Series**
- RRULE support  
- Exclusion dates  
- Recurrence expansion  

### 🔔 **Reminders & Attendees**
- Notification support  
- Event participation tracking  

---

# 🧩 **AI Service (FastAPI)**

The AI service runs independently from the frontend.

### **Endpoints**
- `GET /healthz` – Health check  
- `POST /chat` – Contextual AI chat endpoint  

### **Responsibilities**
- Maintain embeddings per user  
- Graph-based document linking  
- Context selection (workspace / folder / file)  
- LLM orchestration  

---

# 🛠 **Tech Stack**

## **Frontend**
- Next.js (App Router)  
- TypeScript  
- Tailwind CSS  
- Prisma ORM  

## **Backend (AI Service)**
- FastAPI  
- Uvicorn  
- Python  
- Embedding models  
- Graph RAG architecture  

## **Database**
- Prisma  
- PostgreSQL  
- Vector store integration  

## **Deployment**
- Vercel (Frontend)  
- Independent AI microservice  

---

# ⚙️ **Local Development**

## **Frontend Setup**

```bash
npm install
npm run dev
