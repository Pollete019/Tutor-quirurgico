# Clinical Medicine Module

> Search strategy for clinical, surgical and perioperative-nursing research

**Trigger scenarios**: clinical questions, surgical techniques and instrumentation, perioperative care, drug/device evidence, clinical guidelines, systematic reviews, evidence for teaching material

## Sources (priority order)

### 1. Clinical practice guidelines (highest weight for "what should be done")
- **NICE** (nice.org.uk) - UK national guidelines, transparent evidence grading
- **SIGN** (sign.ac.uk) - Scottish guidelines
- **GuiaSalud** (guiasalud.es) - Spanish National Health System guideline catalogue
- **WHO** (who.int) - global guidance, e.g. Surgical Safety Checklist, surgical site infection prevention
- **ERAS Society** (erassociety.org) - enhanced recovery protocols by surgical specialty
- **Specialty societies**: Asociación Española de Cirujanos (aecirujanos.es), ACS (facs.org), AORN (aorn.org) for perioperative nursing standards, AEEQ (Asociación Española de Enfermería Quirúrgica)

### 2. Evidence syntheses
- **Cochrane Library** (cochranelibrary.com) - systematic reviews, gold standard for interventions
- **Epistemonikos** (epistemonikos.org) - largest database of systematic reviews, multilingual
- **TRIP Database** (tripdatabase.com) - evidence-based search engine, filters by evidence type
- **PROSPERO** (crd.york.ac.uk/prospero) - registered systematic reviews (ongoing work)

### 3. Primary literature
- **PubMed / MEDLINE** (pubmed.ncbi.nlm.nih.gov) - primary biomedical index
- **Europe PMC** (europepmc.org) - PubMed plus full-text open access and preprints
- **SciELO** (scielo.org) and **BVS / LILACS / IBECS** (bvsalud.org) - Spanish- and Portuguese-language literature
- **medRxiv** (medrxiv.org) - clinical preprints (NOT peer reviewed)

### 4. Trials, safety and regulation
- **ClinicalTrials.gov** and **WHO ICTRP** (trialsearch.who.int) - registered trials, unpublished/ongoing results
- **AEMPS** (aemps.gob.es), **EMA** (ema.europa.eu), **FDA** (fda.gov) - drug/device approvals, safety alerts; FDA **MAUDE** for surgical device adverse events

### 5. Reference / teaching
- **NCBI Bookshelf / StatPearls** (ncbi.nlm.nih.gov/books) - free peer-reviewed clinical summaries, useful for instrumentation and procedure basics
- Manufacturer IFUs (instructions for use) for specific instruments and reprocessing/sterilization

## Query strategy

- **Structure the question as PICO** (Population, Intervention, Comparison, Outcome) before searching; derive terms per element
- **Use MeSH + free text** in PubMed: `"Surgical Wound Infection"[MeSH] OR "surgical site infection"[tiab]`
- **Filter by study type** with publication types: `"Systematic Review"[pt]`, `"Meta-Analysis"[pt]`, `"Randomized Controlled Trial"[pt]`, `"Practice Guideline"[pt]`
- **Search in English AND Spanish** (e.g. "instrumental quirúrgico", "enfermería quirúrgica") to capture SciELO/IBECS and local guidelines
- **Restrict dates** for practice questions (last 5-10 years) but keep seminal/landmark trials
- **Prefer APIs via WebFetch when WebSearch is weak**:
  - PubMed: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=20&term=<query>` then `esummary.fcgi?db=pubmed&retmode=json&id=<ids>`
  - Europe PMC: `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=20&query=<query>`
- **Check for newer evidence**: search whether a cited review has an update, or whether later RCTs contradict it

## Evidence appraisal (MANDATORY in output)

- Label every key claim with its **evidence level**: guideline recommendation (state grade if given, e.g. GRADE strong/weak) > systematic review/meta-analysis > RCT > cohort/case-control > case series/expert opinion
- Report **study design, sample size, population and year** for primary studies
- Flag **preprints**, **retracted papers** (check Retraction Watch / PubMed "Retracted Publication" tag), **industry-funded** studies and **predatory or non-indexed journals**
- Note **geographic/regulatory context**: a recommendation from NICE or FDA may not match Spanish practice or AEMPS status
- When sources conflict, present both and explain why (population, date, methodology)
- Always cite **DOI or PMID** alongside the link

## Safety caveats

- Output is for education and research, not for individual patient decisions; state this when the question is patient-specific
- Never extrapolate dosages, contraindications or device use beyond what the source states; quote the source verbatim for such data
