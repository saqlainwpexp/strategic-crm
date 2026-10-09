// SPF / DKIM / DMARC checks for sending domains.

import dns from "dns/promises";
import type { DomainCheck } from "@/lib/email-types";

const PROVIDERS: { match: RegExp; name: string; spfInclude: string; dkimSelectors: string[] }[] = [
  { match: /hostinger/i, name: "Hostinger", spfInclude: "_spf.mail.hostinger.com", dkimSelectors: ["hostingermail1", "hostingermail2", "hostingermail3", "hostingermail-a", "hostingermail-b", "hostingermail-c"] },
  { match: /gmail|google/i, name: "Google Workspace", spfInclude: "_spf.google.com", dkimSelectors: ["google"] },
  { match: /office365|outlook/i, name: "Microsoft 365", spfInclude: "spf.protection.outlook.com", dkimSelectors: ["selector1", "selector2"] },
  { match: /zoho/i, name: "Zoho Mail", spfInclude: "zoho.com", dkimSelectors: ["zmail", "zoho", "default"] },
  { match: /sendgrid/i, name: "SendGrid", spfInclude: "sendgrid.net", dkimSelectors: ["s1", "s2"] },
  { match: /mailgun/i, name: "Mailgun", spfInclude: "mailgun.org", dkimSelectors: ["k1", "mx", "smtp"] },
  { match: /amazonaws|amazonses/i, name: "Amazon SES", spfInclude: "amazonses.com", dkimSelectors: [] },
];

const COMMON_SELECTORS = ["default", "dkim", "mail", "k1", "s1", "s2", "selector1", "selector2", "google"];

export function providerFor(smtpHost: string | undefined) {
  return smtpHost ? PROVIDERS.find((p) => p.match.test(smtpHost)) ?? null : null;
}

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

export async function checkDomain(domain: string, smtpHost?: string) {
  const provider = providerFor(smtpHost);
  const root = await txt(domain);
  const spfRecord = root.find((r) => r.toLowerCase().startsWith("v=spf1"));
  let spf: DomainCheck = "fail";
  if (spfRecord) spf = !provider || spfRecord.includes(provider.spfInclude) ? "pass" : "warn";

  const dmarcRecord = (await txt(`_dmarc.${domain}`)).find((r) => r.toUpperCase().startsWith("V=DMARC1"));
  const dmarc: DomainCheck = dmarcRecord ? "pass" : "fail";

  let dkim: DomainCheck = "warn";
  let dkimSelector: string | undefined;
  for (const sel of [...(provider?.dkimSelectors ?? []), ...COMMON_SELECTORS]) {
    const name = `${sel}._domainkey.${domain}`;
    let records = await txt(name);
    if (!records.length) {
      // Many providers publish DKIM as a CNAME pointing at their own TXT record.
      try {
        const [target] = await dns.resolveCname(name);
        if (target) records = await txt(target);
      } catch {
        /* none */
      }
    }
    if (records.some((r) => /v=DKIM1|k=rsa|p=/i.test(r))) {
      dkim = "pass";
      dkimSelector = sel;
      break;
    }
  }

  return {
    spf,
    dkim,
    dmarc,
    details: { spfRecord, dmarcRecord, dkimSelector, provider: provider?.name, spfInclude: provider?.spfInclude },
  };
}
