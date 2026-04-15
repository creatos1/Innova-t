const tabs = document.querySelectorAll(".tab-btn");
const roleInput = document.querySelector("#roleInput");
const roleBadge = document.querySelector("#roleBadge");
const loginForm = document.querySelector("#loginForm");
const formMessage = document.querySelector("#formMessage");

if (tabs.length && roleInput && roleBadge) {
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((button) => button.classList.remove("active"));
      tab.classList.add("active");

      const role = tab.dataset.role || "student";
      roleInput.value = role;
      roleBadge.textContent = `Rol actual: ${role === "admin" ? "Admin / Teacher" : "Estudiante"}`;
    });
  });
}

if (loginForm && formMessage) {
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const email = document.querySelector("#email");
    const password = document.querySelector("#password");
    const role = roleInput ? roleInput.value : "student";

    if (!email || !password) {
      return;
    }

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    const passwordValid = password.value.trim().length >= 6;

    formMessage.className = "form-message";

    if (!emailValid || !passwordValid) {
      formMessage.classList.add("error");
      formMessage.textContent = "Verifica el correo y usa una contrasena de al menos 6 caracteres.";
      return;
    }

    formMessage.classList.add("success");
    formMessage.textContent = "Datos validados correctamente. Redirigiendo a la vista demo...";

    window.setTimeout(() => {
      window.location.href = role === "admin" ? "admin-dashboard.html" : "student-dashboard.html";
    }, 700);
  });
}
