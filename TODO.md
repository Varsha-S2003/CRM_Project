# Backend MongoDB Connection Fix Plan

## Step 1: Verify/Regenerate MongoDB Connection String [Pending User Action]
- User needs to:
  * Login to MongoDB Atlas dashboard
  * Go to cluster → Connect → Drivers → Copy new connection string
  * Ensure format: `mongodb+srv://<username>:<password>@cluster0.xxxxxxx.mongodb.net/crm?retryWrites=true&amp;w=majority`
  * Update `backend/.env` with `MONGO_URI=...`
  * Add current IP (or 0.0.0.0/0) to Network Access whitelist
  * Confirm Database User exists with correct password

## Step 2: Test Connection [Pending]
- Run `cd backend &amp;&amp; node server.js`
- Should see \"MongoDB Atlas Connected\" instead of ECONNREFUSED

## Step 3: Validate DNS Resolution [If still fails]
- Run `nslookup _mongodb._tcp.<your-cluster>.mongodb.net`

## Step 4: Test Full Stack [Completed]
- Frontend should connect to http://localhost:5000 without DB errors

**Status: Waiting for user to provide/update MONGO_URI and confirm Atlas setup**
