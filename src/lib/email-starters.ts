// Starter emails for a digital agency (web design, graphic design, GHL). Plain, personal
// cold-email style: short, no heavy design — that's what gets replies and avoids spam folders.

export const STARTER_TEMPLATES: { name: string; subject: string; html: string }[] = [
  {
    name: "Website audit — first touch",
    subject: "Quick idea for {{business_name}}'s website",
    html: `<p>Hi {{first_name|there}},</p><p>I was looking at {{business_name}}'s website and noticed a couple of things that are likely costing you enquiries — mainly on mobile, where most of your visitors come from.</p><p>We help businesses in {{city|your area}} turn their site into a steady source of leads. I put together three quick fixes for your homepage. Would it be useful if I sent them over?</p><p>Best,<br>{{sender_name}}</p>`,
  },
  {
    name: "GHL — missed calls & follow-up",
    subject: "{{business_name}} — are missed calls slipping through?",
    html: `<p>Hi {{first_name|there}},</p><p>Most local businesses miss 1 in 4 calls, and those callers rarely try again.</p><p>We set up a simple system for {{service|businesses like yours}} that texts back every missed call within seconds, follows up new enquiries automatically and books them straight into your calendar.</p><p>Open to a 10-minute call this week to see if it fits {{business_name}}?</p><p>Thanks,<br>{{sender_name}}</p>`,
  },
  {
    name: "Brand refresh — graphic design",
    subject: "A fresher look for {{business_name}}?",
    html: `<p>Hi {{first_name|there}},</p><p>I came across {{business_name}} and really liked what you do. I did notice the branding looks a little different across your website, social pages and signage.</p><p>We help businesses pull it all together — logo refresh, a simple brand kit and ready-to-post social templates — so everything looks as good as the service you provide.</p><p>Want me to send a couple of examples?</p><p>Cheers,<br>{{sender_name}}</p>`,
  },
  {
    name: "Gentle follow-up",
    subject: "Re: {{business_name}}",
    html: `<p>Hi {{first_name|there}},</p><p>Just floating this back to the top of your inbox in case it got buried. Happy to share a few quick ideas for {{business_name}} — no strings attached.</p><p>Worth a short chat?</p><p>{{sender_name}}</p>`,
  },
  {
    name: "Break-up email",
    subject: "Should I close your file?",
    html: `<p>Hi {{first_name|there}},</p><p>I haven't heard back, so I'll assume now isn't the right time and won't keep following up.</p><p>If things change and you'd like help with your website or getting more enquiries, just reply to this email — I'm happy to help.</p><p>All the best,<br>{{sender_name}}</p>`,
  },
];
