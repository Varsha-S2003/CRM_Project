function queryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function renderInfo(customer) {
  const container = document.getElementById("customer-info");
  const fields = [
    ["Name", customer.name || "-"],
    ["Email", customer.email || "-"],
    ["Phone", customer.phone || "-"],
    ["Created", customer.created_at || "-"],
    ["ID", customer.id],
  ];

  container.innerHTML = fields
    .map(
      ([label, value]) => `
        <div class="info-item">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </div>
      `
    )
    .join("");
}

function renderDeals(deals) {
  const tbody = document.querySelector("#deal-table tbody");
  if (!deals.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No deals found.</td></tr>';
    return;
  }

  tbody.innerHTML = deals
    .map((deal) => {
      const badgeClass = deal.status.replace(/\s+/g, "-");
      return `
        <tr>
          <td>${deal.service_type}</td>
          <td><span class="badge ${badgeClass}">${deal.status}</span></td>
          <td>${deal.created_at}</td>
        </tr>
      `;
    })
    .join("");
}

function renderActivities(activities) {
  const tbody = document.querySelector("#activity-table tbody");
  if (!activities.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No activities found.</td></tr>';
    return;
  }

  tbody.innerHTML = activities
    .map(
      (activity) => `
      <tr>
        <td>${activity.type}</td>
        <td>${activity.notes || "-"}</td>
        <td>${activity.date}</td>
      </tr>
    `
    )
    .join("");
}

async function loadCustomerDetail() {
  const customerId = queryParam("id");
  if (!customerId) {
    alert("Customer id is missing in URL.");
    return;
  }

  const response = await fetch(`/customers/${customerId}`);
  if (!response.ok) {
    const data = await response.json();
    alert(data.error || "Could not fetch customer details");
    return;
  }

  const data = await response.json();
  renderInfo(data.customer);
  renderDeals(data.deals);
  renderActivities(data.activities);
}

loadCustomerDetail();
