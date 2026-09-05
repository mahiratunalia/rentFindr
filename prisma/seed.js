import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";

const prisma = new PrismaClient();

const hoursAgo = (n) => new Date(Date.now() - n * 3_600_000);
const daysAgo = (n) => hoursAgo(n * 24);

// Labeled SVG placeholders (not a blank pixel) so the admin review page and
// listing detail page show something legible in a faculty demo instead of an
// empty box — real photo bytes aren't the point, a working pipeline is.
function placeholderImage(label, bg = "e5e7eb", fg = "374151") {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='300'><rect width='100%' height='100%' fill='#${bg}'/><text x='50%' y='50%' font-family='sans-serif' font-size='22' fill='#${fg}' text-anchor='middle' dominant-baseline='middle'>${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function main() {
  // Seed demo landlord accounts first — the 3 hardcoded listings below reference
  // their real user IDs, so this must run before the listings upsert.
  const landlordPassword = await bcryptjs.hash("landlord123", 10);
  const rezaul = await prisma.user.upsert({
    where: { email: "landlord@baskhuji.local" },
    update: { name: "Rezaul Karim" },
    create: {
      email: "landlord@baskhuji.local",
      name: "Rezaul Karim",
      passwordHash: landlordPassword,
      role: "LANDLORD",
      profile: {
        create: { displayName: "Rezaul Karim", accountType: "landlord" },
      },
    },
    include: { profile: true },
  });
  console.log("✓ Demo landlord: landlord@baskhuji.local / landlord123");

  // Seed second landlord
  const shirin = await prisma.user.upsert({
    where: { email: "shirin@baskhuji.local" },
    update: {},
    create: {
      email: "shirin@baskhuji.local",
      name: "Shirin Akter",
      passwordHash: landlordPassword,
      role: "LANDLORD",
      profile: {
        create: { displayName: "Shirin Akter", accountType: "landlord" },
      },
    },
    include: { profile: true },
  });
  console.log("✓ Demo landlord: shirin@baskhuji.local / landlord123");

  // Seed third landlord
  const anwar = await prisma.user.upsert({
    where: { email: "anwar@baskhuji.local" },
    update: {},
    create: {
      email: "anwar@baskhuji.local",
      name: "Anwar Hossain",
      passwordHash: landlordPassword,
      role: "LANDLORD",
      profile: {
        create: { displayName: "Anwar Hossain", accountType: "landlord" },
      },
    },
    include: { profile: true },
  });
  console.log("✓ Demo landlord: anwar@baskhuji.local / landlord123");

  // Pre-verify the 3 demo landlords — they predate the verification feature,
  // so without this they'd suddenly lose the ability to post Active listings.
  for (const [landlord, nid, phone, address] of [
    [rezaul, "1988 4412 5567", "+880 1711 200 100", "House 14, Road 7, Dhanmondi, Dhaka"],
    [shirin, "1990 7723 9981", "+880 1811 300 200", "House 22, Road 3, Banani, Dhaka"],
    [anwar, "1985 3391 4420", "+880 1911 400 300", "House 9, Sector 7, Uttara, Dhaka"],
  ]) {
    await prisma.landlordVerification.upsert({
      where: { profileId: landlord.profile.id },
      update: { status: "verified", reviewedAt: new Date() },
      create: {
        profileId: landlord.profile.id,
        nidNumber: nid,
        phone,
        propertyAddress: address,
        status: "verified",
        reviewedAt: new Date(),
      },
    });
  }
  console.log("✓ Pre-verified the 3 demo landlords");

  // Seed the 3 hardcoded listings, each pointing at a real landlord's User.id —
  // previously these used placeholder "ll-1"/"ll-2"/"ll-3" strings that matched
  // no real user, so Trust Signals fell back to an unknown/unverified landlord.
  const listingsData = [
    {
      id: "bk-1041",
      title: "Sunlit single room, quiet lane off Bailey Road",
      area: "Shantinagar",
      city: "Dhaka",
      latitude: 23.7423,
      longitude: 90.4098,
      rent: 9500,
      deposit: 19000,
      roomType: "Single room",
      availableFrom: new Date("2026-09-01"),
      status: "Active",
      postedOn: new Date("2026-07-18"),
      landlordId: rezaul.id,
      sqft: 180,
    },
    {
      id: "bk-1042",
      title: "Two-seat mess room with balcony, student block",
      area: "Mohammadpur",
      city: "Dhaka",
      latitude: 23.7639,
      longitude: 90.3589,
      rent: 6200,
      deposit: 6200,
      roomType: "Shared mess",
      availableFrom: new Date("2026-08-15"),
      status: "Active",
      postedOn: new Date("2026-07-22"),
      landlordId: shirin.id,
      sqft: 220,
    },
    {
      id: "bk-1043",
      title: "Compact studio with kitchenette, rooftop access",
      area: "Uttara Sector 7",
      city: "Dhaka",
      latitude: 23.8687,
      longitude: 90.3987,
      rent: 14000,
      deposit: 28000,
      roomType: "Studio",
      availableFrom: new Date("2026-08-01"),
      status: "Active",
      postedOn: new Date("2026-07-05"),
      landlordId: anwar.id,
      sqft: 340,
    },
  ];

  for (const l of listingsData) {
    await prisma.listing.upsert({
      where: { id: l.id },
      update: { sqft: l.sqft, landlordId: l.landlordId },
      create: l,
    });
    console.log("✓ Listing upserted:", l.id);
  }

  // Seed demo tenant accounts — 3 of them, so roommate matching has real candidates
  // to compute against instead of showing an empty "be the first" state.
  const tenantPassword = await bcryptjs.hash("tenant123", 10);
  const demoTenants = [
    { email: "tenant@baskhuji.local", name: "Tanzila Rahman" },
    { email: "tenant2@baskhuji.local", name: "Farhan Kabir" },
    { email: "tenant3@baskhuji.local", name: "Nusrat Jahan" },
  ];
  const tenantProfiles = {};
  for (const t of demoTenants) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name },
      create: {
        email: t.email,
        name: t.name,
        passwordHash: tenantPassword,
        role: "TENANT",
        profile: {
          create: { displayName: t.name, accountType: "tenant" },
        },
      },
      include: { profile: true },
    });
    tenantProfiles[t.email] = user.profile.id;
    console.log(`✓ Demo tenant: ${t.email} / tenant123`);
  }

  // Give each demo tenant a genuinely different lifestyle preference, so the
  // roommate matcher has real, varied candidates to score against.
  const roommatePreferences = [
    {
      email: "tenant@baskhuji.local",
      budget: 9500,
      sleep: "Early",
      smoking: "No",
      smokingNonNegotiable: true,
      cooking: "Occasionally",
      study: "Quiet",
      visitors: "Rare",
    },
    {
      email: "tenant2@baskhuji.local",
      budget: 10500,
      sleep: "Late",
      smoking: "Tolerant",
      smokingNonNegotiable: false,
      cooking: "Daily",
      study: "Social",
      visitors: "Frequent",
    },
    {
      email: "tenant3@baskhuji.local",
      budget: 8800,
      sleep: "Flexible",
      smoking: "No",
      smokingNonNegotiable: false,
      cooking: "Rarely",
      study: "Mixed",
      visitors: "Occasional",
    },
  ];
  for (const p of roommatePreferences) {
    const profileId = tenantProfiles[p.email];
    const fields = {
      budget: p.budget,
      sleep: p.sleep,
      smoking: p.smoking,
      smokingNonNegotiable: p.smokingNonNegotiable,
      cooking: p.cooking,
      study: p.study,
      visitors: p.visitors,
    };
    await prisma.roommatePreference.upsert({
      where: { profileId },
      update: fields,
      create: { profileId, ...fields },
    });
  }
  console.log("✓ Seeded roommate preferences for all 3 demo tenants");

  // Real demo activity across listings, so logging into any of the 3 demo
  // landlord accounts (or the demo tenant) shows working features immediately —
  // ranked applicants, roommate compatibility on a shared listing, a saved
  // listing, and a verification queue for admin — instead of empty states.
  // This is scoped to the demo accounts only; a genuinely new signup still
  // starts empty, since faking data into a real new user's own account would
  // undercut the trust-signal work done elsewhere in this app.
  const tanzila = tenantProfiles["tenant@baskhuji.local"];
  const farhan = tenantProfiles["tenant2@baskhuji.local"];
  const nusrat = tenantProfiles["tenant3@baskhuji.local"];

  const demoApplications = [
    // Tanzila's application on Rezaul's single room is accepted, so the
    // agreement flow (draft → sign → PDF) is demoable end to end.
    { profileId: tanzila, listingId: "bk-1041", status: "accepted" },
    // All 3 tenants apply to Shirin's shared mess room — same listing, so
    // their roommate preferences produce real compatibility pairs on her
    // landlord desk.
    { profileId: tanzila, listingId: "bk-1042", status: "submitted" },
    { profileId: farhan, listingId: "bk-1042", status: "submitted" },
    { profileId: nusrat, listingId: "bk-1042", status: "submitted" },
    // A shortlisted applicant on Anwar's studio, for ranking/status variety.
    { profileId: farhan, listingId: "bk-1043", status: "shortlisted" },
  ];
  for (const a of demoApplications) {
    await prisma.application.upsert({
      where: { profileId_listingId: { profileId: a.profileId, listingId: a.listingId } },
      update: { status: a.status },
      create: { profileId: a.profileId, listingId: a.listingId, status: a.status },
    });
  }
  console.log("✓ Seeded demo applications (ranked applicants + a shared-listing roommate group)");

  await prisma.savedListing.upsert({
    where: { profileId_listingId: { profileId: nusrat, listingId: "bk-1043" } },
    update: {},
    create: { profileId: nusrat, listingId: "bk-1043" },
  });
  console.log("✓ Seeded a demo saved listing");

  // Tanzila is a verified tenant (shows the trust badge + ranks first);
  // Farhan has a pending submission so admin's queue isn't empty on login.
  await prisma.tenantVerification.upsert({
    where: { profileId: tanzila },
    update: { status: "verified", reviewedAt: new Date() },
    create: {
      profileId: tanzila,
      nidNumber: "1994 7712 8830",
      phone: "+880 1712 445 908",
      status: "verified",
      reviewedAt: new Date(),
    },
  });
  await prisma.tenantVerification.upsert({
    where: { profileId: farhan },
    update: {},
    create: {
      profileId: farhan,
      nidNumber: "1996 3321 7710",
      phone: "+880 1812 990 213",
      status: "pending",
    },
  });
  console.log("✓ Seeded demo tenant verifications (one verified, one pending for admin review)");

  // A pre-drafted agreement for Tanzila's accepted application, so the agreement
  // page and her profile both show a real entry without waiting on a live Gemini
  // call first. Signatures are left blank on purpose — signing live (draw or
  // type) is itself a feature worth demoing, not something to fake in advance.
  const agreementReference = "bk-1041/12M";
  await prisma.agreementDraft.upsert({
    where: { profileId_reference: { profileId: tanzila, reference: agreementReference } },
    update: {},
    create: {
      profileId: tanzila,
      reference: agreementReference,
      source: "fallback",
      termsJson: {
        reference: agreementReference,
        landlordName: "Rezaul Karim",
        landlordVerifiedSince: "verified",
        tenantName: "Tanzila Rahman",
        tenantNid: "1994 7712 8830",
        tenantPhone: "+880 1712 445 908",
        propertyTitle: "Sunlit single room, quiet lane off Bailey Road",
        roomType: "Single room",
        area: "Shantinagar",
        city: "Dhaka",
        coords: "23.7423, 90.4098",
        rent: 9500,
        deposit: 19000,
        durationMonths: 12,
        startDate: "1 Sep 2026",
        endDate: "1 Sep 2027",
        houseRules: [],
      },
      clausesJson: [
        {
          title: "Parties",
          body: 'This agreement is made between Rezaul Karim (the "Landlord"), a BasaKhuji-verified property owner, and Tanzila Rahman (the "Tenant"), holder of National ID 1994 7712 8830, contactable on +880 1712 445 908.',
        },
        {
          title: "Premises",
          body: 'The Landlord lets the single room described as "Sunlit single room, quiet lane off Bailey Road" at Shantinagar, Dhaka.',
        },
        {
          title: "Term",
          body: "The tenancy runs 12 months from 1 Sep 2026 to 1 Sep 2027, renewable by mutual written acknowledgement on the platform.",
        },
        {
          title: "Rent and deposit",
          body: "Rent is BDT 9,500 per month, payable by the 5th and logged on BasaKhuji. A refundable security deposit of BDT 19,000 is held and returned at final settlement, less documented deductions.",
        },
        {
          title: "Record of tenancy",
          body: "Every payment, maintenance request and message exchanged on the platform forms part of the tenancy record and may be relied on by either party in a dispute.",
        },
      ],
    },
  });
  console.log("✓ Seeded a demo agreement draft (unsigned — sign it live to demo the feature)");

  // A settled rent payment for Tanzila's accepted tenancy on bk-1041, so the
  // Rent Payment Logger & Activity Timeline (profile page and landlord desk)
  // shows a real entry immediately. Logging a *new* payment still requires
  // live SSLCOMMERZ sandbox credentials — this just seeds the history.
  const demoTransactionId = "DEMO-TXN-BK1041-JUL2026";
  await prisma.payment.upsert({
    where: { transactionId: demoTransactionId },
    update: {},
    create: {
      transactionId: demoTransactionId,
      listingId: "bk-1041",
      profileId: tanzila,
      amount: 9500,
      month: "July 2026",
      status: "paid",
      validationId: "demo-validation",
    },
  });
  const hasDemoActivity = await prisma.activityEvent.findFirst({
    where: { listingId: "bk-1041", tenantProfileId: tanzila, type: "payment_logged" },
  });
  if (!hasDemoActivity) {
    await prisma.activityEvent.create({
      data: {
        listingId: "bk-1041",
        tenantProfileId: tanzila,
        type: "payment_logged",
        actor: "tenant",
        summary: "Rent payment of ৳9,500 logged for July 2026.",
        metadata: { transactionId: demoTransactionId, amount: 9500, month: "July 2026" },
      },
    });
  }
  console.log("✓ Seeded a demo rent payment and activity timeline entry for Tanzila's tenancy");

  // ── Landlord Verification & Property Document Management demo data ──────────
  // Fleshes out the 3 pre-verified demo landlords with the full document set
  // (NID, ownership proof, selfie-with-NID) so their verification progress
  // shows 100% instead of admin-review-only, adds two more landlords in the
  // pending/rejected states so the admin queue and the progress bar have real
  // variety to demo, adds tenant-inspection documents, real message threads
  // (so avg response time / response rate aren't "No data yet"), a couple of
  // completed tenancies (so completedRentals isn't 0), and recent lastActiveAt
  // timestamps (so the Activity signal isn't "No activity yet").
  for (const landlord of [rezaul, shirin, anwar]) {
    await prisma.landlordVerification.update({
      where: { profileId: landlord.profile.id },
      data: {
        nidPhotoUrl: placeholderImage("NID Photo (demo)"),
        ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
        selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      },
    });
  }
  console.log("✓ Filled in NID / ownership / selfie photos for the 3 verified demo landlords");

  const kamrulPassword = await bcryptjs.hash("landlord123", 10);
  const kamrul = await prisma.user.upsert({
    where: { email: "kamrul@baskhuji.local" },
    update: { name: "Kamrul Islam" },
    create: {
      email: "kamrul@baskhuji.local",
      name: "Kamrul Islam",
      passwordHash: kamrulPassword,
      role: "LANDLORD",
      profile: { create: { displayName: "Kamrul Islam", accountType: "landlord" } },
    },
    include: { profile: true },
  });
  await prisma.landlordVerification.upsert({
    where: { profileId: kamrul.profile.id },
    update: {
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: null,
      status: "pending",
    },
    create: {
      profileId: kamrul.profile.id,
      nidNumber: "1992 5510 3324",
      phone: "+880 1611 500 400",
      propertyAddress: "House 5, Road 11, Mirpur, Dhaka",
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      status: "pending",
    },
  });
  console.log(
    "✓ Demo landlord (pending, no selfie yet — partial progress): kamrul@baskhuji.local / landlord123",
  );

  const tahmina = await prisma.user.upsert({
    where: { email: "tahmina@baskhuji.local" },
    update: { name: "Tahmina Sultana" },
    create: {
      email: "tahmina@baskhuji.local",
      name: "Tahmina Sultana",
      passwordHash: kamrulPassword,
      role: "LANDLORD",
      profile: { create: { displayName: "Tahmina Sultana", accountType: "landlord" } },
    },
    include: { profile: true },
  });
  await prisma.landlordVerification.upsert({
    where: { profileId: tahmina.profile.id },
    update: {
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "rejected",
      reviewNote:
        "NID photo is blurry and the address on the ownership proof doesn't match — please resubmit clearer scans.",
      reviewedAt: daysAgo(1),
    },
    create: {
      profileId: tahmina.profile.id,
      nidNumber: "1993 8820 1145",
      phone: "+880 1511 600 500",
      propertyAddress: "House 30, Road 2, Lalmatia, Dhaka",
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "rejected",
      reviewNote:
        "NID photo is blurry and the address on the ownership proof doesn't match — please resubmit clearer scans.",
      reviewedAt: daysAgo(1),
    },
  });
  console.log("✓ Demo landlord (rejected, full submission): tahmina@baskhuji.local / landlord123");

  // Real teammates' accounts, wired for a live admin approve/reject demo with
  // real Gmail delivery to real inboxes rather than @baskhuji.local placeholders.
  const taufiqur = await prisma.user.findUnique({
    where: { email: "mdtaufiqurrahman23@gmail.com" },
    include: { profile: true },
  });
  if (taufiqur?.profile) {
    await prisma.landlordVerification.upsert({
      where: { profileId: taufiqur.profile.id },
      update: {
        nidPhotoUrl: placeholderImage("NID Photo (demo)"),
        ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
        selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
        status: "pending",
      },
      create: {
        profileId: taufiqur.profile.id,
        nidNumber: "1991 2245 8890",
        phone: "+880 1911 700 600",
        propertyAddress: "House 18, Road 5, Bashundhara R/A, Dhaka",
        nidPhotoUrl: placeholderImage("NID Photo (demo)"),
        ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
        selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
        status: "pending",
      },
    });
    console.log(
      "✓ Submitted a pending verification for Taufiqur's real account (mdtaufiqurrahman23@gmail.com) — ready for a live approve/reject demo",
    );
  } else {
    console.log(
      "⚠ Skipped Taufiqur's verification — no account found for mdtaufiqurrahman23@gmail.com",
    );
  }

  const navidGmail = await prisma.user.upsert({
    where: { email: "mustakimarup19@gmail.com" },
    update: {},
    create: {
      email: "mustakimarup19@gmail.com",
      name: "Navid Mustakim Arup",
      passwordHash: kamrulPassword,
      role: "LANDLORD",
      profile: { create: { displayName: "Navid Mustakim Arup", accountType: "landlord" } },
    },
    include: { profile: true },
  });
  await prisma.landlordVerification.upsert({
    where: { profileId: navidGmail.profile.id },
    update: {
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "pending",
    },
    create: {
      profileId: navidGmail.profile.id,
      nidNumber: "1993 6610 2245",
      phone: "+880 1811 800 700",
      propertyAddress: "House 3, Road 12, Baridhara, Dhaka",
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "pending",
    },
  });
  console.log(
    "✓ Demo landlord (pending, real inbox — separate from his existing verified school-email account): mustakimarup19@gmail.com / landlord123",
  );

  const aliaMt = await prisma.user.upsert({
    where: { email: "alia.mt18@gmail.com" },
    update: {},
    create: {
      email: "alia.mt18@gmail.com",
      name: "Mahira Alia",
      passwordHash: kamrulPassword,
      role: "LANDLORD",
      profile: { create: { displayName: "Mahira Alia", accountType: "landlord" } },
    },
    include: { profile: true },
  });
  await prisma.landlordVerification.upsert({
    where: { profileId: aliaMt.profile.id },
    update: {
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "pending",
    },
    create: {
      profileId: aliaMt.profile.id,
      nidNumber: "1995 4471 3320",
      phone: "+880 1711 900 800",
      propertyAddress: "House 27, Road 9, Dhanmondi, Dhaka",
      nidPhotoUrl: placeholderImage("NID Photo (demo)"),
      ownershipProofUrl: placeholderImage("Ownership Proof (demo)"),
      selfiePhotoUrl: placeholderImage("Selfie with NID (demo)"),
      status: "pending",
    },
  });
  console.log("✓ Demo landlord (pending, real inbox): alia.mt18@gmail.com / landlord123");

  // Documents for tenant inspection — only verified landlords can have these.
  const rezaulDocCount = await prisma.landlordDocument.count({
    where: { profileId: rezaul.profile.id },
  });
  if (rezaulDocCount === 0) {
    await prisma.landlordDocument.createMany({
      data: [
        {
          profileId: rezaul.profile.id,
          type: "utility_bill",
          label: "DESCO electricity bill, July 2026",
          fileUrl: placeholderImage("Utility Bill (demo)", "dbeafe", "1e3a8a"),
        },
        {
          profileId: rezaul.profile.id,
          type: "sublet_agreement",
          label: "Sub-let clause, building management",
          fileUrl: placeholderImage("Sub-let Agreement (demo)", "dbeafe", "1e3a8a"),
        },
      ],
    });
  }
  const shirinDocCount = await prisma.landlordDocument.count({
    where: { profileId: shirin.profile.id },
  });
  if (shirinDocCount === 0) {
    await prisma.landlordDocument.create({
      data: {
        profileId: shirin.profile.id,
        type: "utility_bill",
        label: "WASA water bill, July 2026",
        fileUrl: placeholderImage("Utility Bill (demo)", "dbeafe", "1e3a8a"),
      },
    });
  }
  console.log("✓ Seeded tenant-inspection documents for Rezaul and Shirin");

  // A couple of completed tenancies, on top of the existing accepted/submitted/
  // shortlisted ones, so completedRentals is nonzero for at least 2 landlords
  // and 2 tenants — new profileId+listingId pairs, doesn't touch the existing
  // seeded applications.
  const tanzilaOnBk1043 = await prisma.application.upsert({
    where: { profileId_listingId: { profileId: tanzila, listingId: "bk-1043" } },
    update: { status: "completed" },
    create: { profileId: tanzila, listingId: "bk-1043", status: "completed" },
  });
  const nusratOnBk1041 = await prisma.application.upsert({
    where: { profileId_listingId: { profileId: nusrat, listingId: "bk-1041" } },
    update: { status: "completed" },
    create: { profileId: nusrat, listingId: "bk-1041", status: "completed" },
  });
  console.log("✓ Seeded 2 completed tenancies (Tanzila @ Anwar's studio, Nusrat @ Rezaul's room)");

  // Real message threads so avg response time / response rate are computed
  // from actual data instead of showing "No data yet".
  const tanzilaOnBk1041 = await prisma.application.findUnique({
    where: { profileId_listingId: { profileId: tanzila, listingId: "bk-1041" } },
  });
  const farhanOnBk1042 = await prisma.application.findUnique({
    where: { profileId_listingId: { profileId: farhan, listingId: "bk-1042" } },
  });

  async function seedThread(applicationId, tenantProfileId, landlordProfileId, turns) {
    const existing = await prisma.message.count({ where: { applicationId } });
    if (existing > 0) return;
    for (const t of turns) {
      await prisma.message.create({
        data: {
          applicationId,
          senderProfileId: t.role === "tenant" ? tenantProfileId : landlordProfileId,
          senderRole: t.role,
          body: t.body,
          createdAt: t.at,
        },
      });
    }
  }

  if (tanzilaOnBk1041) {
    await seedThread(tanzilaOnBk1041.id, tanzila, rezaul.profile.id, [
      {
        role: "tenant",
        body: "Hi, can I move in a couple of days early if the room's ready?",
        at: daysAgo(6),
      },
      {
        role: "landlord",
        body: "Should be fine — I'll confirm once the previous tenant checks out.",
        at: daysAgo(6 - 3 / 24),
      },
      {
        role: "tenant",
        body: "Great, thank you! Also, is there parking for a bicycle?",
        at: daysAgo(5),
      },
      {
        role: "landlord",
        body: "Yes, there's a rack in the ground-floor hallway.",
        at: daysAgo(5 - 1 / 24),
      },
      { role: "tenant", body: "Perfect, that works for me.", at: daysAgo(4) },
      { role: "landlord", body: "See you on move-in day!", at: daysAgo(4 - 0.75 / 24) },
    ]);
  }
  if (farhanOnBk1042) {
    await seedThread(farhanOnBk1042.id, farhan, shirin.profile.id, [
      {
        role: "tenant",
        body: "Is the shared mess room still available from mid-August?",
        at: daysAgo(3),
      },
      { role: "landlord", body: "Yes, one bed is open from the 15th.", at: daysAgo(3 - 4 / 24) },
      { role: "tenant", body: "Does the rent include utilities?", at: daysAgo(2) },
      {
        role: "landlord",
        body: "Water and gas are included, electricity is split by meter reading.",
        at: daysAgo(2 - 2 / 24),
      },
    ]);
  }
  await seedThread(nusratOnBk1041.id, nusrat, rezaul.profile.id, [
    {
      role: "tenant",
      body: "Hi, I just wrapped up my tenancy — could you confirm the deposit return timeline?",
      at: daysAgo(10),
    },
    {
      role: "landlord",
      body: "Confirmed, no deductions — it'll be returned within 7 days.",
      at: daysAgo(10 - 5 / 24),
    },
    { role: "tenant", body: "Thank you for being so quick about it!", at: daysAgo(9) },
  ]);
  await seedThread(tanzilaOnBk1043.id, tanzila, anwar.profile.id, [
    {
      role: "tenant",
      body: "Hi, before I moved in — does the studio get direct sunlight in the mornings?",
      at: daysAgo(40),
    },
    {
      role: "landlord",
      body: "Yes, east-facing window, good morning light.",
      at: daysAgo(40 - 6 / 24),
    },
    { role: "tenant", body: "That settles it, I'll go ahead and apply.", at: daysAgo(39) },
  ]);
  console.log("✓ Seeded real message threads (avg response time + response rate now computable)");

  // Recent lastActiveAt so the Activity signal shows "Active Xh/d ago" instead
  // of "No activity yet" — normally set by the ActivityPing component on a
  // real browser visit, backfilled here for the demo accounts.
  const activityTimestamps = [
    [rezaul.profile.id, hoursAgo(1)],
    [shirin.profile.id, hoursAgo(5)],
    [anwar.profile.id, hoursAgo(26)],
    [kamrul.profile.id, hoursAgo(3)],
    [tanzila, hoursAgo(0.5)],
    [farhan, hoursAgo(4)],
    [nusrat, hoursAgo(50)],
  ];
  for (const [profileId, lastActiveAt] of activityTimestamps) {
    await prisma.profile.update({ where: { id: profileId }, data: { lastActiveAt } });
  }
  console.log("✓ Backfilled recent activity timestamps for demo profiles");

  // Seed admin account
  const adminPassword = await bcryptjs.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@baskhuji.local" },
    update: { name: "Platform Admin" },
    create: {
      email: "admin@baskhuji.local",
      name: "Platform Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
      profile: {
        create: { displayName: "Platform Admin", accountType: "tenant" },
      },
    },
  });
  console.log("✓ Demo admin: admin@baskhuji.local / admin123");

  console.log("\n✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
