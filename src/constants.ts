export const DEPARTMENTS = [
  'Pharmacy',
  'Physiotherapy',
  'Biomedical Laboratory Science (BMLS)',
  'Medicine and Surgery (MBBS)',
  'Nursing'
];

export const DEPARTMENT_PRICES: Record<string, { ngn: number, usd: number }> = {
  'Medicine and Surgery (MBBS)': { ngn: 15000, usd: 10 },
  'Pharmacy': { ngn: 10000, usd: 7 },
  'Physiotherapy': { ngn: 10000, usd: 7 },
  'Biomedical Laboratory Science (BMLS)': { ngn: 10000, usd: 7 },
  'Nursing': { ngn: 10000, usd: 7 },
  'Human Nutrition and Dietetics': { ngn: 10000, usd: 7 },
  'Veterinary Medicine': { ngn: 10000, usd: 7 }
};

export const DEPARTMENT_STRUCTURE: Record<string, any> = {
  'Biomedical Laboratory Science (BMLS)': {
    levels: ['200L', '300L', '400L', '500L', 'Ochei Questions', 'Application Questions'],
    categories: ['MCQ Practice', 'Theoretical Questions', 'OCHEI Question Bank', 'Application Questions'],
    coursesByLevel: {
      'MCQ Practice': {
        '200L': ['Anatomy', 'Physiology', 'Biochemistry'],
        '300L': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology', 'Immunology'],
        '400L': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology', 'Virology'],
        '500L': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology']
      },
      'Theoretical Questions': {
        'default': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology']
      },
      'OCHEI Question Bank': {
        'default': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology']
      },
      'Application Questions': {
        'default': ['Hematology', 'Chemical Pathology', 'Histopathology', 'Medical Microbiology']
      }
    }
  },
  'Medicine and Surgery (MBBS)': {
    levels: ['MB 1', 'MB 2', 'MB 3', 'MB 4'],
    categories: ['Professional Exam', 'Object Questions', 'Practical Application'],
    coursesByLevel: {
      'Professional Exam': {
        'MB 1': ['Gross Anatomy', 'Histology', 'Neuroanatomy', 'Embryology', 'Medical Biochemistry', 'Physiology'],
        'MB 3': ['Gynecology', 'Obstetrics', 'Internal Medicine', 'Surgery', 'Paediatrics'],
        'MB 4': ['Anaesthesiology', 'Dentistry', 'Opthalmology', 'Othorhinolarygology', 'Psychiatry', 'Radiology']
      },
      'Object Questions': {
        'MB 2': ['Chemical Pathology', 'Histopathology', 'Medical Microbiology', 'Hematology', 'Pharmacology']
      },
      'Practical Application': {
        'MB 2': ['Chemical Pathology', 'Histopathology', 'Medical Microbiology', 'Hematology', 'Pharmacology']
      }
    }
  },
  'Pharmacy': {
    levels: ['200L', '300L', '400L', '500L'],
    categories: ['General'],
    coursesByLevel: {
      'General': {
        '200L': ['Physiology', 'Inorganic Pharmaceutical Chemistry', 'Pharmaceutical Microbiology', 'Pharmacognosy', 'Physical Pharmaceutical Chemistry 1'],
        '300L': ['Applied Pharmaceutical Microbiology', 'Biochemistry', 'Drug of Biological Origin', 'Organic Pharmaceutical Chemistry', 'Pharmacology', 'Physical Pharmaceutical Chemistry 2', 'Physical Pharmaceutics', 'Pharmacognosy'],
        '400L': ['Applied Pharmaceutical Microbiology', 'Chemotherapy', 'Herbal Medicine and Phototherapy', 'Medicinal Chemistry', 'Biopharmacy and Pharmacokinetics', 'Pharmaceutical Biotechnology', 'Drug Dosage Form II', 'Pharmacotherapeutics', 'Traditional Medicine', 'Veterinary Pharmacy'],
        '500L': ['Drug Metabolism', 'Endocrine and Nutritional Disorder', 'Immunology', 'Pharmaceutical Clinical Pharmacology', 'Pharmacogenetics and Clinical Pharmacy', 'Pharmacotherapy and Clinical Pharmacokinetics', 'Public Health Pharmacy', 'Systemic Toxicology', 'Total Quality System']
      }
    }
  },
  'Nursing': {
    levels: ['200L', '300L', '400L', '500L', 'Application Questions'],
    categories: ['General', 'Theoretical Application', 'Application Questions'],
    coursesByLevel: {
      'General': {
        '200L': ['Anatomy', 'Physiology', 'Biochemistry'],
        '300L': ['Reproductive System', 'Human Behaviour and Health', 'Maternal and Child Health', 'Medical Surgical Nursing', 'Mental Health and Behaviour', 'Midwifery'],
        '400L': ['Maternal and Child Health', 'Medical Surgical Nursing', 'Midwifery'],
        '500L': ['Intensive Care Nursing', 'Gerontological Nursing', 'Midwifery', 'Opthalmic Nursing', 'Perioperative Nursing', 'Neurological Disorder']
      },
      'Theoretical Application': {
        '500L': ['Theoretical Application Question']
      },
      'Application Questions': {
        'default': ['General Nursing Application']
      }
    }
  },
  'Physiotherapy': {
    levels: ['200L', '300L', '400L', '500L'],
    categories: ['General'],
    coursesByLevel: {
      'General': {
        '200L': ['Anatomy', 'Physiology', 'Biochemistry'],
        '300L': ['Kinesiology', 'Electrotherapy', 'Medical Science'],
        '400L': ['Orthopedics', 'Neurology', 'Pediatrics'],
        '500L': ['Clinical Practice', 'Professional Ethics']
      }
    }
  },
  'Human Nutrition and Dietetics': {
    levels: ['200L', '300L', '400L', 'Application Questions'],
    categories: ['General', 'Application Questions'],
    coursesByLevel: {
      'General': {
        '200L': ['Anatomy', 'Physiology', 'Biochemistry'],
        '300L': ['Nutrition Science', 'Dietetics'],
        '400L': ['Clinical Nutrition']
      },
      'Application Questions': {
        'default': ['Application Questions']
      }
    }
  },
  'Veterinary Medicine': {
    levels: ['200L', '300L', '400L', '500L', '600L', 'Application Questions'],
    categories: ['General', 'Application Questions'],
    coursesByLevel: {
      'General': {
        '200L': ['Veterinary Anatomy', 'Veterinary Physiology'],
        '300L': ['Veterinary Pathology'],
        '400L': ['Veterinary Pharmacology'],
        '500L': ['Veterinary Medicine I'],
        '600L': ['Veterinary Medicine II']
      },
      'Application Questions': {
        'default': ['Application Questions']
      }
    }
  }
};
