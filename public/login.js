document.getElementById('login_form').addEventListener('submit', async (event) => {
    event.preventDefault();
  
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
  
    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const idToken = await userCredential.user.getIdToken();
  
        fetch('/verifyToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken }), 
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                window.location.href = '/';
            } else {
                console.error('Error logging in:', data.error);
            }
        });
    } catch (error) {
        console.error('Authentication error:', error); 
        document.getElementById('error-message').textContent = 'Please check email account or password.';
    }
});
