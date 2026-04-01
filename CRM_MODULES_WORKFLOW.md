# CRM Project: Module Division & Workflows for 2-Member Team

## Module Names & Ownership

### MEMBER 1: Prospect Management & Auth Modules
| Module | Frontend Files | Backend Files | Description |
|--------|----------------|---------------|-------------|
| **Auth** | `src/Login.js`, `src/ForgotPassword.js`, `src/ResetPassword.js` | `routes/authRoutes.js`, `utils/mailer.js` | Login (JWT), forgot-password (email reset tokens), password reset. |
| **Employee Management** | `src/AddEmployee.js`, `src/Employees.js` | `routes/employeeRoutes.js`, `models/user.js` | Add employees w/ password strength, manager assignment, roles (Admin/Manager/Employee). |
| **Leads** | `src/Leads.js`, `src/LeadRequests.js`, `src/components/FilterBuilder.js` | `routes/leadRoutes.js`, `models/lead.js`, `utils/leadScoring.js` | Kanban CRUD, stages, duplicate merge, scoring, CSV import/export, saved views/filters. |
| **Usecase Notes** | `src/UsecaseModule.js` | (via activities/lead models) | Structured meeting notes for qualified \"interested\" leads (Requirements/Challenges/Features/BAT). |

### MEMBER 2: Sales Pipeline & Operations Modules
| Module | Frontend Files | Backend Files | Description |
|--------|----------------|---------------|-------------|
| **Deals** | `src/Deals.js` | `routes/dealRoutes.js`, `models/deal.js` | Pipeline stages (qualification→need_analysis→proposal→won/lost), proposals (draft/approval/send), probability/forecast, notifications. |
| **Products** | `src/Products.js` | `routes/productRoutes.js`, `models/product.js` | Catalog/SKU management, pricing, categories. |
| **Inventory** | `src/Inventory.js` | `routes/inventoryRoutes.js`, `models/inventory.js` | Stock tracking, low-stock alerts (deal integration). |
| **Documents** | `src/DocumentsModule.js` | (file storage) | Deal/lead attachments. |

### Shared Modules (Both Maintain)
| Module | Files | Description |
|--------|-------|-------------|
| **Notifications** | `src/pages/NotificationsPage.js` | `models/notification.js` | Real-time alerts (stage changes, stock). |
| **Views/Filters** | `src/components/FilterBuilder.js`, `ViewManager.js` | `models/view.js` | Saved views across modules. |
| **Sidebar/API** | `src/Sidebar.js`, `src/services/api.js` | `middleware/auth.js` | Navigation, shared API calls. |

## Workflow Explanations

### MEMBER 1: Prospecting Workflow
```
1. AUTH: User Login → JWT → Role Dashboard
   (login → forgot-password email → reset token)

2. EMPLOYEE: Admin → Add Employee (form validation → auto-username → manager assign)
   → New employees auto-get leads assigned (Employee→Manager rule)

3. LEADS KANBAN:
   New (capture) → Contacted (+phone/email) → Qualified (+company/source + usecase notes)
   → Proposal Sent → Converted (auto→Deal/Customer/Contact) OR Lost
   
   Features:
   - Duplicate auto-detect/merge
   - Lead scoring (email opens/site visits)
   - Bulk CSV import/export
   - Saved views/filters (FilterBuilder)

4. USECASE: Qualified meeting → Structured notes:
   Requirements → Challenges → Features Needed → BAT → Notes
```

### MEMBER 2: Sales Execution Workflow
```
1. DEALS PIPELINE (from converted leads):
   Qualification → Need Analysis (stock check) → Value Proposition
   → Proposal/Quote → Negotiate → Won (deduct stock) OR Lost
   
   Features:
   - Proposal: Draft → Manager Approval → Send Client
   - Inventory sync: Low-stock → Customer email (wait Yes/No) → Admin alert
   - Probability/forecasting (expected revenue)
   - Notifications (stage changes)

2. PRODUCTS: Add/edit catalog → Assign to deals
3. INVENTORY: Track stock → Low-stock blocks Won deals
4. DOCUMENTS: Attach files to deals/leads
```

## Key Interactions & Dependencies
```
Leads.convert() → Auto-create: Deal + Customer + Contact
Deal.Won → Deduct Inventory + Set Customer.product/status
Low-Stock → Email Customer → Notify Admin/Wait Restock
Employee → Auto-assign Leads (Employee→Manager)
Notifications → Cross-module alerts
Views/Filters → Reusable in Leads/Deals
```

## Next Steps After Division
1. **Member 1**: Test auth→employee→leads→usecase end-to-end + edge cases (duplicates, assignments).
2. **Member 2**: Test lead→deal conversion + deal stages/proposals/stock + documents.
3. **Both**: Shared notifications/views, full pipeline (Lead→Deal→Won).
4. **Run**: `npm install && npm run dev` (backend:5000, frontend:3000).
5. **Deploy**: No extra setup (existing package.json).

This division gives **clear ownership** with **minimal overlap**. Member 1 handles inbound/prospecting, Member 2 handles outbound/sales ops.

**Plan complete - modules divided + workflows documented.**

