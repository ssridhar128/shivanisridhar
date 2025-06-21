from flask import Flask, request, jsonify, redirect, url_for, session, render_template
import os
import requests
import fitz  # PyMuPDF
from dotenv import load_dotenv
from authlib.integrations.flask_client import OAuth
from email.mime.text import MIMEText
import base64
import re
import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth
# Load environment variables
load_dotenv()

# Flask and OAuth setup
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "this_should_be_configured")

# Firebase setup
cred = credentials.Certificate("firebase_service_account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    access_token_url='https://oauth2.googleapis.com/token',
    authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
    api_base_url='https://gmail.googleapis.com/',
    client_kwargs={
        'scope': 'https://www.googleapis.com/auth/gmail.send',
        'prompt': 'consent',
        'access_type': 'offline'
    }
)

# Global storage for generated email (not suitable for production!)
email_store = {}

# Helper to fix line breaks inside paragraphs
def fix_line_breaks(text):
    # Split text into paragraphs by double newlines
    paragraphs = text.split('\n\n')
    cleaned_paragraphs = []
    for p in paragraphs:
        # Remove all newline chars inside paragraph and replace with spaces
        p_clean = ' '.join(line.strip() for line in p.splitlines())
        # Collapse multiple spaces to one space
        p_clean = re.sub(r'\s+', ' ', p_clean)
        cleaned_paragraphs.append(p_clean)
    # Join paragraphs with exactly two newlines for paragraph breaks
    return '\n\n'.join(cleaned_paragraphs)

# Routes
@app.route("/")
def home():
    return redirect("/form")

@app.route("/form")
def show_form():
    return render_template("index.html")

@app.route("/signup", methods=["GET"])
def show_signup():
    return render_template("signup.html")

@app.route("/login", methods=["GET"])
def show_login():
    return render_template("login.html")


@app.route("/signup", methods=["POST"])
def signup():
    email = request.form.get("email")
    password = request.form.get("password")
    full_name = request.form.get("full_name")

    if not all([email, password, full_name]):
        return jsonify({"error": "Missing fields"}), 400

    try:
        # Check if user exists
        fb_auth.get_user_by_email(email)
        return jsonify({"error": "User already exists"}), 409
    except fb_auth.UserNotFoundError:
        user = fb_auth.create_user(email=email, password=password, display_name=full_name)
        db.collection('users').document(user.uid).set({
            'email': email,
            'name': full_name
        })
        return jsonify({"message": "✅ Signup successful"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/login", methods=["POST"])
def login():
    email = request.form.get("email")
    try:
        print("📩 Login attempt for:", email)

        # Force Firestore to load results immediately
        users = list(db.collection('users').where('email', '==', email).stream())
        if users:
            user = users[0]
            user_data = user.to_dict()
            session['user_email'] = email
            session['user_name'] = user_data.get('name')
            print("✅ Login success:", session['user_name'])
            return redirect("/form")
        else:
            print("❌ No user found")
            return jsonify({"error": "User not found"}), 404

    except Exception as e:
        print("🔥 Exception during login:", str(e))
        return jsonify({"error": str(e)}), 500
# Utils
def extract_text_from_pdf(pdf_file):
    text = ""
    with fitz.open(stream=pdf_file.read(), filetype="pdf") as doc:
        for page in doc:
            text += page.get_text()
    return text.strip()

@app.route("/generate-email", methods=["POST"])
def generate_email():
    if "resume" not in request.files or not all(k in request.form for k in ["company", "full_name", "recruiter_name", "recruiter_email"]):
        return jsonify({"error": "Missing required fields"}), 400

    resume = request.files["resume"]
    company = request.form["company"]
    full_name = request.form["full_name"]
    recruiter_name = request.form["recruiter_name"]
    recruiter_email = request.form["recruiter_email"]

    try:
        resume_summary = extract_text_from_pdf(resume)
        prompt = f"""
        You are a career assistant generating a cold email for a job or networking opportunity.

The user’s name is: {full_name}

Here is the user’s resume summary:
{resume_summary}

They are reaching out to the following company or person:
{recruiter_name} at {company}

Please generate the full body of a **professional, personalized cold email** that:
- Starts with “Hi {recruiter_name or company},\nMy name is {full_name}.”
- Clearly shows interest in the company
- Mentions relevant experience from the resume
- Ends with a polite ask, should be friendly, professional, and include a specific ask (e.g., coffee chat, internship or opportunity to talk)
- Signs off with "Sincerely,\n{full_name}"
- Avoids generic phrases and fluff that is not part of the email body like “here is the email” or "here is the cold email that fits your requirements"
- Write in **full paragraphs** with **natural spacing** between them. **Avoid inserting line breaks inside sentences**.

Output only the email body as plain text. Do not include any explanation, heading, or commentary.
"""

        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama3-70b-8192",
                "messages": [
                    {"role": "system", "content": "You are a career assistant helping users write professional emails."},
                    {"role": "user", "content": prompt.strip()}
                ]
            }
        )

        result = response.json()
        if "choices" in result and result["choices"]:
            email_text = result["choices"][0]["message"]["content"]
            # Fix line breaks inside paragraphs
            email_text = fix_line_breaks(email_text)

            # Store fixed email and recipient
            email_store['email_body'] = email_text
            email_store['recruiter_email'] = recruiter_email
            return jsonify({"email": email_text})
        else:
            return jsonify({"error": "Unexpected response from Groq API", "raw_response": result}), 502

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# @app.route("/login")
# def login():
#     return google.authorize_redirect(url_for('authorize', _external=True))

@app.route("/authorize")
def authorize():
    token = google.authorize_access_token()
    session['token'] = token
    return redirect(url_for('send_email'))

@app.route("/send-email")
def send_email():
    token = session.get('token')
    if not token:
        return redirect(url_for('login'))
    google.token = token

    try:
        user_email = google.get('gmail/v1/users/me/profile').json().get('emailAddress')
        email_body = email_store.get("email_body")
        recipient = email_store.get("recruiter_email")

        if not email_body or not recipient:
            return jsonify({"error": "Email body or recipient not set"}), 400

        # Clean up the email text if you want
        email_body = fix_line_breaks(email_body)

        mime_msg = MIMEText(email_body, "plain", "utf-8")
        mime_msg['to'] = recipient
        mime_msg['subject'] = "Let's Connect!"

        raw_msg = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode()

        send_response = google.post(
            'gmail/v1/users/me/messages/send',
            json={'raw': raw_msg}
        )

        if send_response.ok:
            return jsonify({"status": "✅ Email sent successfully", "from": user_email})
        else:
            return jsonify({"error": "❌ Failed to send email", "details": send_response.json()}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Run app
if __name__ == '__main__':
    app.run(debug=True, port=5000)
