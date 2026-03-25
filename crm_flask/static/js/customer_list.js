async function loadCustomers() {
  const tbody = document.querySelector("#customer-table tbody");
  tbody.innerHTML = "";

  try {
    const response = await fetch("/customers");
    if (!response.ok) {
      throw new Error("Failed to fetch customers");
    }

    const customers = await response.json();
    if (!customers.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No customers found.</td></tr>';
      return;
    }

    customers.forEach((customer) => {
      const tr = document.createElement("tr");
      tr.classList.add("clickable");
      tr.innerHTML = `
        <td>${customer.name || "-"}</td>
        <td>${customer.email || "-"}</td>
        <td>${customer.phone || "-"}</td>
      `;
      tr.addEventListener("click", () => {
        window.location.href = `/ui/customer?id=${customer.id}`;
      });
      tbody.appendChild(tr);
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">${error.message}</td></tr>`;
  }
}

loadCustomers();
