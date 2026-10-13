const API_URL = 'http://127.0.0.1:5000';

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("container");
    document.getElementById("signUp").addEventListener("click", () => {
      container.classList.add("right-panel-active");
    });
  
    document.getElementById("signIn").addEventListener("click", () => {
      container.classList.remove("right-panel-active");
    });

    // Register Form
    document.getElementById("registerForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const username = document.getElementById("regUsername").value;
        const email = document.getElementById("regEmail").value;
        const password = document.getElementById("regPassword").value;
        const messageDiv = document.getElementById("regMessage");

        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();
            
            if (response.ok) {
                messageDiv.textContent = "✓ Registration successful!";
                messageDiv.style.color = "green";
                document.getElementById("registerForm").reset();
                setTimeout(() => {
                    container.classList.remove("right-panel-active");
                }, 2000);
            } else {
                messageDiv.textContent = "✗ " + data.error;
                messageDiv.style.color = "red";
            }
        } catch (error) {
            messageDiv.textContent = "✗ Connection error";
            messageDiv.style.color = "red";
        }
    });

    // Login Form
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const username = document.getElementById("loginUsername").value;
        const password = document.getElementById("loginPassword").value;
        const messageDiv = document.getElementById("loginMessage");

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            
            if (response.ok) {
                messageDiv.textContent = "✓ Login successful!";
                messageDiv.style.color = "green";
                localStorage.setItem('user', JSON.stringify(data));
                setTimeout(() => {
                    window.location.href = '../index.html';
                }, 1500);
            } else {
                messageDiv.textContent = "✗ " + data.error;
                messageDiv.style.color = "red";
            }
        } catch (error) {
            messageDiv.textContent = "✗ Connection error";
            messageDiv.style.color = "red";
        }
    });
});