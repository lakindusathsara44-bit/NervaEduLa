// Sri Lankan G.C.E. subject names, grouped by exam level.
const OL_NAMES = [
  'Buddhism', 'Saivaneri', 'Catholicism', 'Christianity', 'Islam',
  'Sinhala Language & Literature', 'Tamil Language & Literature', 'English Language',
  'Mathematics', 'Science', 'History', 'Business & Accounting Studies', 'Geography',
  'Civic Education', 'Entrepreneurship Studies', 'Second Language - Sinhala', 'Second Language - Tamil',
  'Pali', 'Sanskrit', 'French', 'German', 'Hindi', 'Japanese', 'Arabic', 'Korean', 'Chinese', 'Russian',
  'Music (Oriental)', 'Music (Western)', 'Carnatic Music', 'Dancing (Indigenous)', 'Bharatha Dancing',
  'Art', 'Appreciation of English Literary Texts', 'Appreciation of Sinhala Literary Texts',
  'Appreciation of Tamil Literary Texts', 'Appreciation of Arabic Literary Texts',
  'Drama & Theatre (Sinhala)', 'Drama & Theatre (Tamil)', 'Drama & Theatre (English)',
  'Information & Communication Technology', 'Agriculture & Food Technology', 'Aquatic Bioresources Technology',
  'Arts & Crafts', 'Home Economics', 'Health & Physical Education', 'Communication & Media Studies',
  'Design & Construction Technology', 'Design & Mechanical Technology', 'Design, Electrical & Electronic Technology',
  'Electronic Writing & Shorthand (Sinhala)', 'Electronic Writing & Shorthand (Tamil)',
  'Electronic Writing & Shorthand (English)'
];

const AL_NAMES = [
  'Physics', 'Chemistry', 'Biology', 'Combined Mathematics', 'Advanced Mathematics', 'Mathematics',
  'Agricultural Science', 'Engineering Technology', 'Biosystems Technology', 'Science for Technology',
  'Civil Technology', 'Mechanical Technology', 'Electrical, Electronic & Information Technology',
  'Food Technology', 'Agricultural Technology', 'Bio Resource Technology', 'Economics',
  'Accounting', 'Business Studies', 'Business Statistics', 'Geography', 'Political Science',
  'Logic & Scientific Method', 'History (Sri Lankan, Indian, European & Modern World)',
  'Buddhism', 'Hinduism', 'Christianity', 'Islam', 'Buddhist Civilization', 'Hindu Civilization',
  'Christian Civilization', 'Islamic Civilization', 'Art', 'Dancing (Indigenous)', 'Bharatha Dancing',
  'Oriental Music', 'Carnatic Music', 'Western Music', 'Drama & Theatre (Sinhala)',
  'Drama & Theatre (Tamil)', 'Drama & Theatre (English)', 'Communication & Media Studies',
  'Home Science', 'Information & Communication Technology', 'General Information Technology',
  'Sinhala', 'Tamil', 'English', 'Sinhala Literature', 'Tamil Literature', 'English Literature',
  'Greek & Roman Civilization',
  'Pali', 'Sanskrit', 'Arabic', 'French', 'German', 'Hindi', 'Japanese', 'Korean', 'Chinese',
  'Russian', 'Malay', 'Common General Test', 'General English'
];

const SCHOLARSHIP_NAMES = ['Sinhala Language Skills', 'Tamil Language Skills', 'Mathematics', 'Environment and General Knowledge', 'Reasoning and Intelligence'];
const SCHOLARSHIP_SUBJECTS = SCHOLARSHIP_NAMES.map(name => 'Scholarship — ' + name);

const OL_SUBJECTS = OL_NAMES.map(name => `O/L — ${name}`);
const AL_SUBJECTS = AL_NAMES.map(name => `A/L — ${name}`);
const EXAM_SUBJECTS = [...OL_SUBJECTS, ...AL_SUBJECTS, ...SCHOLARSHIP_SUBJECTS];
if (typeof module !== 'undefined' && module.exports) module.exports = { OL_NAMES, AL_NAMES, OL_SUBJECTS, AL_SUBJECTS, SCHOLARSHIP_NAMES, SCHOLARSHIP_SUBJECTS, EXAM_SUBJECTS };
