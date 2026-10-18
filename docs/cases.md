# The cases behind Dawa Alert

Contaminated or substandard medicine reaching children is not a one-off. The cases below are all documented in official notices,
and each one shows a different reason a single, source-linked, per-batch record is useful.

| Case | What the record shows | Why it matters for Dawa Alert |
|---|---|---|
| **Coldrif, Respifresh TR, ReLife** (India, 2025) | [WHO Alert N°5/2025](https://cdn.who.int/media/docs/default-source/substandard-and-falsified/n5_2025_syrup-medicines_en.pdf) names three batches with DEG: Coldrif `SR-13` (48.6% w/v), Respifresh TR `R01GL2523` (1.34%), ReLife `LSL25160` (0.61%). Telangana's drug controller issued a stop-use notice on 4 Oct; WHO's alert followed on 13 Oct. | The same batch was flagged by a state lab, a state controller and WHO on different dates. Dawa Alert keeps all three, each with its own source link: scan `SR-13` and you see them together. This is our live demo batch. |
| **COLDBEST-PC syrup** (J&K, 2019-20) | CDSCO's [March 2020 drug alert](https://cdsco.mohfw.gov.in/opencms/resources/UploadCDSCOWeb/2018/UploadAlertsFiles/A%20list%20for%20Drugs%20alert%20March%202020.pdf) lists COLDBEST-PC from Digital Vision (Himachal Pradesh), batch `DL5201`, positive for DEG. Infant deaths in Jammu & Kashmir were linked to it in reports. | The problem pre-dates 2025 by years, and the evidence sat in a monthly PDF. A per-batch record outlives the PDF. |
| **Maiden Pharmaceuticals** (The Gambia, 2022) | WHO's alert of 5 Oct 2022 covered four syrups after acute kidney injury in children. India's government later told Parliament its committee found insufficient evidence of a causal link, and that its own tests of control samples were clean. | Sources can *disagree*. A ledger must show each authority's claim separately, with its date, and not pick a winner. We do not resolve disputes; we do not hide them. |
| **DOK-1 Max, Ambronol** (Uzbekistan, 2022-23) | [WHO's annex](https://cdn.who.int/media/docs/default-source/substandard-and-falsified/n1_2023_contaminated-syrup2_en.pdf) lists batches such as `DXS2104`, `DXS2201` (DOK-1 Max) and `AAS2203` (Ambronol), each with an expiry date. | WHO notices often name exact batches and expiry dates, which is the shape Dawa Alert stores (and why a record expires with its batch). |
| **EzriCare artificial tears** (USA, 2023) | The US CDC reported an outbreak of extensively drug-resistant *Pseudomonas aeruginosa* linked to eye drops made by Global Pharma Healthcare in Chennai: 81 patients in 18 states, including vision loss and deaths. | The model is not limited to cough syrup or to Indian notices; foreign regulators' notices about Indian-made products fit the same record. (Not ingested yet.) |

**What these cases do and do not show.** They establish that harmful batches recur and that regulators publish the affected batches.
They do **not** prove that recalled stock stayed on shelves *because* notices were scattered, and Dawa Alert does not claim to have
prevented any harm. What it provides is the missing piece for follow-up: a place where a pharmacist or parent can check an exact batch
against every source, and where a genuine sighting of a flagged batch becomes a lead an inspector can see by pincode and date.

**How the workflow maps to people**

| Who | What they do | What Dawa Alert gives them |
|---|---|---|
| Parent, pharmacist | Type or scan the batch | Every notice for that batch, what it says, its source and date. Never a claim of safety when nothing is found. |
| ASHA / community health worker, chemist | Report a flagged batch seen on a shelf | A privacy-preserving report (batch, pincode, role only) that fades after 30 days unless seen again. |
| Drug inspector | Look for where to go first | Recent sightings grouped by region, a lead to verify, not proof of a failed recall. |
| Researcher, regulator | Audit what was published when | Notices kept as separate, attributed, hash-linked records that cannot be edited afterwards. |

**Design rules taken from these cases:** "no matching alert in the indexed sources" is never presented as "safe"; an NSQ finding, a
suspected spurious product, a stop-use notice and a community sighting are different kinds of evidence and are labelled as such;
records are *mirrored* public notices (the regulators do not sign anything on Arkiv), each keeping its source URL and a hash of the exact
row; and a sighting is a report to be verified, not a fact.
