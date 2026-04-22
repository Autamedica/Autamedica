import json
import urllib.request
import urllib.error

class BillionMailClient:
    def __init__(self, api_url, api_key):
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key

    def send_mail(self, recipient, addresser=None, attribs=None):
        """
        Sends an email using the BillionMail API.
        
        :param recipient: Email address of the recipient
        :param addresser: Optional custom addresser (must be authorized in the template)
        :param attribs: Dictionary of template variables
        """
        url = f"{self.api_url}/batch_mail/api/send"
        payload = {
            "recipient": recipient,
            "attribs": attribs or {}
        }
        if addresser:
            payload["addresser"] = addresser

        headers = {
            "Content-Type": "application/json",
            "x-api-key": self.api_key
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            return {"error": True, "code": e.code, "message": error_body}
        except Exception as e:
            return {"error": True, "message": str(e)}

# Usage Example:
if __name__ == "__main__":
    # Update these values after configuring the API in BillionMail
    API_URL = "http://localhost" 
    API_KEY = "your_api_key_here"
    
    client = BillionMailClient(API_URL, API_KEY)
    # result = client.send_mail(
    #     recipient="test@example.com",
    #     attribs={"name": "Eduardo", "message": "Bienvenido a AutaMedica"}
    # )
    # print(result)
