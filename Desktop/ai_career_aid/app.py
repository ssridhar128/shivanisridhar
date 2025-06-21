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

# Helper to fix line breaks inside paragraphs
def fix_line_breaks(text):
    paragraphs = text.split('\n\n')
    cleaned_paragraphs = []
    for p in paragraphs:
        p_clean = ' '.join(line.strip() for line in p.splitlines())
        p_clean = re.sub(r'\s+', ' ', p_clean)
        cleaned_paragraphs.append(p_clean)
    return '\n\n'.join(cleaned_paragraphs)

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
def login_user():
    email = request.form.get("email")
    password = request.form.get("password")

    if not all([email, password]):
        return jsonify({"error": "Missing email or password"}), 400

    try:
        # Firebase Authentication REST API
        firebase_api_key = os.getenv("FIREBASE_API_KEY")
        url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={firebase_api_key}"

        payload = {
            "email": email,
            "password": password,
            "returnSecureToken": True
        }

        res = requests.post(url, json=payload)
        data = res.json()

        if res.status_code == 200:
            # Successfully authenticated
            user_record = fb_auth.get_user_by_email(email)
            user_doc = db.collection("users").document(user_record.uid).get()
            user_data = user_doc.to_dict() if user_doc.exists else {}

            session['user_email'] = email
            session['user_name'] = user_data.get("name", "User")

            print("✅ Login success:", session['user_name'])
            return redirect("/form")
        else:
            print("❌ Login failed:", data.get("error", {}))
            return jsonify({"error": "Invalid email or password"}), 401

    except Exception as e:
        print("🔥 Exception during login:", str(e))
        return jsonify({"error": str(e)}), 500

# @app.route("/login", methods=["POST"])
# def login_user():
#     email = request.form.get("email")
#     password = request.form.get("password")
#     name = request.form.get("full_name")
#     try:
#         print("📩 Login attempt for:", name)
#         users = list(db.collection('users').where('email', '==', email).stream())
#         if users:
#             user = users[0]
#             user_data = user.to_dict()
#             session['user_email'] = email
#             session['user_name'] = user_data.get('name')
#             print("✅ Login success:", session['user_name'])
#             return redirect("/form")
#         else:
#             print("❌ No user found")
#             return jsonify({"error": "User not found"}), 404
#     except Exception as e:
#         print("🔥 Exception during login:", str(e))
#         return jsonify({"error": str(e)}), 500

# PDF Text Extraction
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
        resume_text = extract_text_from_pdf(resume)
        sentences = re.split(r'(?<=[.!?]) +', resume_text)
        summary = ''
        for s in sentences:
            if len(summary) + len(s) <= 2000:
                summary += s + ' '
            else:
                break
        resume_summary = summary.strip()

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
- Ends with a polite ask
- Signs off with "Sincerely,\n{full_name}"
- No headings, no extra commentary
- Write full paragraphs with natural spacing. No mid-sentence line breaks.
"""

        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {os.getenv('GROQ_API_KEY')}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama3-8b-8192",
                "messages": [
                    {"role": "system", "content": "You are a career assistant helping users write professional emails."},
                    {"role": "user", "content": prompt.strip()}
                ]
            }
        )

        result = response.json()
        print("Groq API Raw Response:", result)

        try:
            email_text = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as e:
            return jsonify({
                "error": "Unexpected response from Groq API",
                "exception": str(e),
                "raw_response": result
            }), 502

        email_text = fix_line_breaks(email_text)

        session['email_body'] = email_text
        session['recruiter_email'] = recruiter_email

        return jsonify({"email": email_text})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/gmail-login")
def gmail_login():
    return google.authorize_redirect(url_for('authorize', _external=True))

@app.route("/authorize")
def authorize():
    token = google.authorize_access_token()
    session['token'] = token
    return redirect(url_for('send_email'))

@app.route("/send-email")
def send_email():
    token = session.get('token')
    if not token:
        return redirect(url_for('gmail_login'))
    google.token = token

    try:
        user_email = google.get('gmail/v1/users/me/profile').json().get('emailAddress')
        email_body = session.get("email_body")
        recipient = session.get("recruiter_email")

        if not email_body or not recipient:
            return jsonify({"error": "Email body or recipient not set"}), 400

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
            return render_template("sent.html")
        else:
            return jsonify({"error": "❌ Failed to send email", "details": send_response.json()}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/sent")
def sent_page():
    return render_template("sent.html")

# Run app
if __name__ == '__main__':
    app.run(debug=True, port=5000)
