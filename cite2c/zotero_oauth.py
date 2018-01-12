"""Get an API token to access a user's Zotero library, using OAuth 1.0a
"""
from notebook.base.handlers import IPythonHandler
from notebook.services.config.manager import ConfigManager
from notebook.utils import url_path_join as ujoin
import os
from rauth import OAuth1Service
from rauth.utils import parse_utf8_qsl
from tornado.web import HTTPError

# If you copy this code, please get your own key at:
#  https://www.zotero.org/oauth/apps
CITE2C_ZOTERO_CLIENT_KEY = "8cc04771a4e2ef9c9c4d"
CITE2C_ZOTERO_CLIENT_SECRET = "9270b1ed6762a87eb253"

def zotero_oauth_service():
    return OAuth1Service(
        name='zotero',
        consumer_key=CITE2C_ZOTERO_CLIENT_KEY,
        consumer_secret=CITE2C_ZOTERO_CLIENT_SECRET,
        request_token_url='https://www.zotero.org/oauth/request',
        access_token_url='https://www.zotero.org/oauth/access',
        authorize_url='https://www.zotero.org/oauth/authorize',
        base_url='https://api.zotero.org')

# These are stored as globals while we wait for the callback.
# We're only trying to handle one user authenticating, so this should be OK.
request_token = ''
request_token_secret = ''

class ZoteroOauthHandler(IPythonHandler):
    """Part 1: Get a request token, send the user to authorize it.
    """
    def get(self):
        global request_token, request_token_secret

        callback = '%s://%s%scite2c/zotero_oauth_cb' % (
            self.request.protocol, self.request.host, self.settings['base_url']
        )
        oauth_svc = zotero_oauth_service()
        request_token, request_token_secret = oauth_svc.get_request_token(
            params={'oauth_callback': callback}
        )
        authorize_url = oauth_svc.get_authorize_url(request_token)
        self.log.info("Zotero OAuth, redirecting to: %s", authorize_url)
        self.redirect(authorize_url)

# HTML+JS to close the tab after OAuth succeeded.
oauth_success = os.path.join(os.path.dirname(__file__), 'oauth_success.html')

class ZoteroOauthCallbackHandler(IPythonHandler):
    """Part 2: Zotero redirects back to here after authorization.

    Get the access token and user info, store them in cite2c's frontend config.
    """
    def get(self):
        if not (request_token and request_token_secret):
            raise HTTPError(log_message='OAuth callback, no request token')
        verifier = self.get_query_argument('oauth_verifier')

        access_token_response = zotero_oauth_service().get_raw_access_token(
            request_token, request_token_secret,
            data={'oauth_verifier': verifier}
        )
        access_token_response.raise_for_status()
        access_info = parse_utf8_qsl(access_token_response.content)
        if 'oauth_token' not in access_info:
            raise HTTPError(log_message="Missing oauth_token. Response content: %r"
                                        % access_token_response.content)

        # We have successfully authenticated.
        cm = ConfigManager()
        cm.update('cite2c', {'zotero': {
            'user_id': access_info['userID'],
            'username': access_info['username'],
            'access_token': access_info['oauth_token'],
        }})
        self.log.info("OAuth completed for Zotero user %s", access_info['userID'])
        with open(oauth_success) as f:
            self.finish(f.read())

def handlers(base_url):
    return [
        (ujoin(base_url, r"/cite2c/zotero_oauth"), ZoteroOauthHandler),
        (ujoin(base_url, r"/cite2c/zotero_oauth_cb"), ZoteroOauthCallbackHandler),
    ]
