import { LegacyPreset } from '../types/necromancer';

export const LEGACY_PRESETS: LegacyPreset[] = [
  {
    id: 'haunted-auth-api',
    name: '2014 Callback Hell Auth API',
    era: 'Node v0.10 • Express 3',
    tagline: 'SQL injection, hardcoded secret, eval() backdoor, and 4-level callback pyramid',
    language: 'javascript',
    code: `// TODO: fix before prod (written 2014)
var API_SECRET = "sk_live_9988776655_DO_NOT_SHARE";

function authenticateUser(req, res) {
  var userInput = req.body.username;
  var query = "SELECT * FROM users WHERE username = '" + userInput + "'";

  db.query(query, function(err, user) {
    if (err) {
      console.log("db error", err);
      return res.status(500).send("fail");
    }
    if (user.role == "admin") {
      var tokenPayload = eval("(" + req.body.meta + ")");
      sessionStore.save(user.id, tokenPayload, function(saveErr, session) {
        if (saveErr) {
          return res.status(500).send("session fail");
        }
        res.json({ ok: true, session: session });
      });
    }
  });
}`,
  },
  {
    id: 'xss-jquery-widget',
    name: 'Cursed jQuery Profile Widget',
    era: '2012 • Browser Script',
    tagline: 'DOM XSS via innerHTML, global var leaks, and loose equality checks',
    language: 'javascript',
    code: `// Legacy user profile renderer
var cachedProfile = null;

function renderUserBanner(containerId, userData) {
  var el = document.getElementById(containerId);
  if (userData.isVerified == true) {
    el.innerHTML = "<div class='badge'>" + userData.bio + "</div>";
  } else {
    el.innerHTML = "<span>Guest: " + userData.name + "</span>";
  }
  console.log("Rendered banner for", userData.name);
}

function hydrateFromHash() {
  var raw = window.location.hash.slice(1);
  var parsed = eval("(" + raw + ")");
  renderUserBanner("profile-root", parsed);
}`,
  },
  {
    id: 'zombie-react-class',
    name: 'Decaying React 15 Class Component',
    era: '2016 • Pre-Hooks React',
    tagline: 'Unsafe UNSAFE_componentWillMount, memory leak interval, and dangerouslySetInnerHTML',
    language: 'typescript',
    code: `// Old dashboard ticker component
class LegacyTicker extends React.Component {
  UNSAFE_componentWillMount() {
    var self = this;
    setInterval(function() {
      fetch("/api/metrics?org=" + self.props.orgId)
        .then(function(r) { return r.json(); });
    }, 2000);
  }

  render() {
    var html = this.props.rawAnnouncement;
    if (this.props.status == "active") {
      return <div dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return null;
  }
}`,
  },
  {
    id: 'dead-payment-worker',
    name: 'Zombie Payment Retry Worker',
    era: '2015 • Cron Script',
    tagline: 'Hardcoded keys, unhandled promise rejections, var leaks, and zombie code',
    language: 'javascript',
    code: `var STRIPE_KEY = "rk_live_deadbeef1234567890";

function processInvoice(invoiceId, amount) {
  var sql = "UPDATE invoices SET paid = 1 WHERE id = " + invoiceId;
  db.execute(sql).then(function(result) {
    if (result.rows == 1) {
      console.log("Paid invoice", invoiceId, amount);
    }
  });
}

// function oldLegacyCharge() {
//   eval("chargeCard()");
// }`,
  },
];
