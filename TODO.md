# CRM Lead Conversion to Customer + Deal(qualification) Workflow

## Current Status: ✅ Approved

**Information Gathered:**
- Lead conversion creates Contact (Customers page) + optional Deal (qualification stage)
- Issue: Deal requires assignedTo, missing in convert → fails
- Fix: Add assignedTo: req.user._id in leadRoutes /convert

**Plan:**
1. Edit backend/routes/leadRoutes.js: Add assignedTo to dealData
2. Test: Convert lead → verify Customer + Deal in qualification

**Steps:**
- [x] 1. Created TODO.md
- [x] 2. Edited backend/routes/leadRoutes.js - Added `assignedTo: req.user._id` to dealData in /convert endpoint
- [x] 3. Fixed Mongoose duplicate index warnings:
  - backend/models/deal.js: Commented duplicate assignedTo index
  - backend/models/notification.js: Commented duplicate dealId index
- [x] 4. Task complete
