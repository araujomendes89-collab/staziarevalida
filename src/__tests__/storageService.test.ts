import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService, DEFAULT_USER } from '../services/storageService';
import { UserProfile, QuestionAttempt, StudyMission } from '../types';

describe('StorageService Regression Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return DEFAULT_USER when no user profile is stored', () => {
    const profile = StorageService.getUserProfile();
    expect(profile).toBeDefined();
    expect(profile.name).toBe(DEFAULT_USER.name);
    expect(profile.role).toBe('STUDENT');
  });

  it('should save and retrieve custom user profile', () => {
    const customProfile: UserProfile = {
      ...DEFAULT_USER,
      id: 'usr-custom-1',
      name: 'Dr. Teste Automatizado',
      email: 'teste@med.br',
      graduationUniversity: 'USP',
      dailyStudyMinutes: 120,
    };

    StorageService.saveUserProfile(customProfile);

    const retrieved = StorageService.getUserProfile();
    expect(retrieved.id).toBe('usr-custom-1');
    expect(retrieved.name).toBe('Dr. Teste Automatizado');
    expect(retrieved.dailyStudyMinutes).toBe(120);
  });

  it('should save and retrieve question attempts without data corruption', () => {
    const attempts: QuestionAttempt[] = [
      {
        id: 'att-test-1',
        questionId: 'REV-2026.1-Q1',
        area: 'CLINICA_MEDICA',
        topic: 'Cardiologia',
        selectedOption: 'A',
        correctOption: 'A',
        isCorrect: true,
        timeSpentSeconds: 35,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'att-test-2',
        questionId: 'REV-2026.1-Q2',
        area: 'CIRURGIA_GERAL',
        topic: 'Trauma',
        selectedOption: 'C',
        correctOption: 'D',
        isCorrect: false,
        timeSpentSeconds: 50,
        timestamp: new Date().toISOString(),
        errorReason: 'DISTRACTOR_TRAP',
      },
    ];

    StorageService.saveAttempts(attempts);

    const retrieved = StorageService.getAttempts();
    expect(retrieved.length).toBe(2);
    expect(retrieved[0].id).toBe('att-test-1');
    expect(retrieved[0].isCorrect).toBe(true);
    expect(retrieved[1].id).toBe('att-test-2');
    expect(retrieved[1].isCorrect).toBe(false);
  });

  it('should add a single attempt prepending to list', () => {
    const initialAttempt: QuestionAttempt = {
      id: 'att-first',
      questionId: 'REV-2026.1-Q1',
      area: 'CLINICA_MEDICA',
      selectedOption: 'A',
      correctOption: 'A',
      isCorrect: true,
      timeSpentSeconds: 20,
      timestamp: new Date().toISOString(),
    };
    StorageService.saveAttempts([initialAttempt]);

    const newAttempt: QuestionAttempt = {
      id: 'att-second',
      questionId: 'REV-2026.1-Q2',
      area: 'PEDIATRIA',
      selectedOption: 'B',
      correctOption: 'B',
      isCorrect: true,
      timeSpentSeconds: 25,
      timestamp: new Date().toISOString(),
    };
    StorageService.addAttempt(newAttempt);

    const all = StorageService.getAttempts();
    expect(all.length).toBe(2);
    expect(all[0].id).toBe('att-second');
    expect(all[1].id).toBe('att-first');
  });

  it('should save and retrieve today study mission', () => {
    const mission: StudyMission = {
      id: 'mis-custom-1',
      title: 'Missão de Fixação',
      estimatedMinutes: 45,
      targetArea: 'GINECOLOGIA_OBSTETRICIA',
      focusTopic: 'Pré-eclâmpsia',
      rationale: 'Foco nos critérios de gravidade',
      tasks: [
        {
          type: 'QUESTIONS',
          description: '10 questões',
          count: 10,
          minutes: 20,
          completed: false,
        },
      ],
    };

    StorageService.saveTodayMission(mission);

    const retrieved = StorageService.getTodayMission();
    expect(retrieved.id).toBe('mis-custom-1');
    expect(retrieved.title).toBe('Missão de Fixação');
    expect(retrieved.targetArea).toBe('GINECOLOGIA_OBSTETRICIA');
  });

  it('should reset user data cleanly on resetUserData call', () => {
    StorageService.saveAttempts([
      {
        id: 'att-to-clean',
        questionId: 'q1',
        area: 'PEDIATRIA',
        selectedOption: 'A',
        correctOption: 'A',
        isCorrect: true,
        timeSpentSeconds: 10,
        timestamp: new Date().toISOString(),
      },
    ]);

    StorageService.resetUserData();

    expect(StorageService.getAttempts().length).toBe(0);
  });
});
