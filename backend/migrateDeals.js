const mongoose = require('mongoose');
const User = require('./models/user');
const Deal = require('./models/deal');

async function migrateDeals() {
  try {
    await mongoose.connect('mongodb://localhost:27017/crm_project');
    
    // Get all users for assignment
    const users = await User.find({}).sort({ createdAt: 1 });
    const nonAdminUsers = users.filter(u => u.role !== 'ADMIN');
    
    if (nonAdminUsers.length === 0) {
      console.log('No non-admin users found. Create some first.');
      return;
    }

    // Update existing deals without assignedTo
    const unassignedDeals = await Deal.find({ assignedTo: { $exists: false } });
    console.log(`Found ${unassignedDeals.length} unassigned deals`);
    
    const results = {
      updated: 0,
      skipped: 0
    };

    for (let deal of unassignedDeals) {
      // Assign to first non-admin user or current user if possible
      const assignee = nonAdminUsers[results.updated % nonAdminUsers.length];
      deal.assignedTo = assignee._id;
      await deal.save();
      results.updated++;
      
      console.log(`Assigned deal "${deal.name}" to ${assignee.username} (${assignee.employee_id})`);
    }

    // Update a few users to create sample hierarchy
    const manager = users.find(u => u.role === 'MANAGER');
    if (manager) {
      const employee = users.find(u => u.role === 'EMPLOYEE' && String(u._id) !== String(manager._id));
      if (employee) {
        employee.reportsTo = manager._id;
        await employee.save();
        console.log(`Set ${employee.username} reports to ${manager.username}`);
      }
    }

    console.log('\n✅ Migration complete!');
    console.log(`Updated ${results.updated} deals with assignedTo`);
    console.log('Restart backend/frontend to test!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.disconnect();
  }
}

migrateDeals();
