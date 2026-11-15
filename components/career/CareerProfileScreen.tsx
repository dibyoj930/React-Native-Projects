/**
 * Career profile: the current direction, not a permanent label.
 *
 * Every field is optional because a user may not want to answer everything. Two
 * values are validated: an experience count must be a non-negative whole number,
 * and a target date (when given) must be a real `YYYY-MM-DD` day. List fields are
 * plain comma-separated text; the profile stores them as arrays so later screens
 * do not have to re-parse prose.
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import type { CareerProfile, CareerProfileDraft } from '../../career';
import { isValidDayKey } from '../../shared/date';
import { useTheme } from '../../theme/useTheme';
import type { Theme } from '../../theme/theme';
import {
  CareerActions,
  CareerBody,
  CareerButton,
  CareerCard,
  CareerCardTitle,
  CareerField,
  CareerMuted,
  CareerScreen,
  CareerSectionLabel,
} from './CareerUI';

export type CareerProfileScreenProps = {
  profile: CareerProfile | null;
  onBack: () => void;
  onSave: (draft: CareerProfileDraft) => void;
};

type Draft = {
  profession: string;
  designation: string;
  industry: string;
  experienceYears: string;
  responsibilities: string;
  expertiseAreas: string;
  interests: string;
  shortTermGoals: string;
  longTermAmbitions: string;
  desiredRoles: string;
  targetOrganisations: string;
  targetDate: string;
  targetTimeline: string;
  strengths: string;
  growthAreas: string;
  constraints: string;
};

function joinList(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(', ') : '';
}

function splitList(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function initialDraft(profile: CareerProfile | null): Draft {
  return {
    profession: profile?.profession ?? '',
    designation: profile?.designation ?? '',
    industry: profile?.industry ?? '',
    experienceYears:
      profile?.experienceYears === null || profile?.experienceYears === undefined
        ? ''
        : String(profile.experienceYears),
    responsibilities: profile?.responsibilities ?? '',
    expertiseAreas: joinList(profile?.expertiseAreas),
    interests: joinList(profile?.interests),
    shortTermGoals: profile?.shortTermGoals ?? '',
    longTermAmbitions: profile?.longTermAmbitions ?? '',
    desiredRoles: joinList(profile?.desiredRoles),
    targetOrganisations: joinList(profile?.targetOrganisations),
    targetDate: profile?.targetDate ?? '',
    targetTimeline: profile?.targetTimeline ?? '',
    strengths: profile?.strengths ?? '',
    growthAreas: profile?.growthAreas ?? '',
    constraints: profile?.constraints ?? '',
  };
}

export function CareerProfileScreen({ profile, onBack, onSave }: CareerProfileScreenProps) {
  const t = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(profile));
  const [experienceError, setExperienceError] = useState<string | undefined>();
  const [dateError, setDateError] = useState<string | undefined>();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = () => {
    const raw = draft.experienceYears.trim();
    let experienceYears: number | null = null;
    if (raw.length > 0) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
        setExperienceError('Use a whole number of years, or leave this blank.');
        return;
      }
      experienceYears = parsed;
    }

    const targetDate = draft.targetDate.trim();
    if (targetDate.length > 0 && !isValidDayKey(targetDate)) {
      setDateError('Use a real date in YYYY-MM-DD form, or leave this blank.');
      return;
    }

    setExperienceError(undefined);
    setDateError(undefined);
    onSave({
      profession: draft.profession.trim(),
      designation: draft.designation.trim(),
      industry: draft.industry.trim(),
      experienceYears,
      responsibilities: draft.responsibilities.trim(),
      expertiseAreas: splitList(draft.expertiseAreas),
      interests: splitList(draft.interests),
      shortTermGoals: draft.shortTermGoals.trim(),
      longTermAmbitions: draft.longTermAmbitions.trim(),
      desiredRoles: splitList(draft.desiredRoles),
      targetOrganisations: splitList(draft.targetOrganisations),
      ...(targetDate.length > 0 ? { targetDate } : {}),
      targetTimeline: draft.targetTimeline.trim(),
      strengths: draft.strengths.trim(),
      growthAreas: draft.growthAreas.trim(),
      constraints: draft.constraints.trim(),
    });
    Alert.alert('Profile saved', 'Your direction has been updated.');
  };

  return (
    <CareerScreen
      backLabel="Back to career"
      onBack={onBack}
      subtitle="Where you are now and where you want to go"
      title="Career profile"
    >
      <CareerCard>
        <CareerCardTitle>Your direction can change</CareerCardTitle>
        <CareerBody>
          A career profile is a working hypothesis. Update it when your interests,
          constraints or target change — the history of your goals and evidence
          stays intact.
        </CareerBody>
      </CareerCard>

      <CareerSectionLabel>Now</CareerSectionLabel>
      <CareerCard>
        <CareerField
          label="Profession or field of work"
          onChangeText={(value) => set('profession', value)}
          placeholder="e.g. nursing, software, construction, teaching"
          value={draft.profession}
        />
        <CareerField
          label="Current designation or role"
          onChangeText={(value) => set('designation', value)}
          placeholder="e.g. early-career, career break, team lead"
          value={draft.designation}
        />
        <CareerField
          label="Industry or sector (optional)"
          onChangeText={(value) => set('industry', value)}
          placeholder="e.g. healthcare, public sector, self-employed"
          value={draft.industry}
        />
        <CareerField
          error={experienceError}
          keyboardType="number-pad"
          label="Years of relevant experience (optional)"
          maxLength={3}
          onChangeText={(value) => {
            set('experienceYears', value);
            if (experienceError) setExperienceError(undefined);
          }}
          placeholder="e.g. 4"
          value={draft.experienceYears}
        />
        <CareerField
          label="Main responsibilities (optional)"
          multiline
          onChangeText={(value) => set('responsibilities', value)}
          placeholder="What does your current work actually involve?"
          value={draft.responsibilities}
        />
      </CareerCard>

      <CareerSectionLabel>Expertise and interests</CareerSectionLabel>
      <CareerCard>
        <CareerField
          label="Areas you already know well (optional)"
          onChangeText={(value) => set('expertiseAreas', value)}
          placeholder="Separate with commas, e.g. patient care, mentoring"
          value={draft.expertiseAreas}
        />
        <CareerField
          label="Professional interests (optional)"
          onChangeText={(value) => set('interests', value)}
          placeholder="Separate with commas, e.g. research, accessibility"
          value={draft.interests}
        />
      </CareerCard>

      <CareerSectionLabel>Direction</CareerSectionLabel>
      <CareerCard>
        <CareerField
          label="Short-term goals (optional)"
          multiline
          onChangeText={(value) => set('shortTermGoals', value)}
          placeholder="What are you trying to change in the next few months?"
          value={draft.shortTermGoals}
        />
        <CareerField
          label="Longer-term ambitions (optional)"
          multiline
          onChangeText={(value) => set('longTermAmbitions', value)}
          placeholder="Where would you like this work to lead?"
          value={draft.longTermAmbitions}
        />
        <CareerField
          label="Desired roles (optional)"
          onChangeText={(value) => set('desiredRoles', value)}
          placeholder="Separate with commas if there is more than one"
          value={draft.desiredRoles}
        />
        <CareerField
          label="Target organisations (optional)"
          onChangeText={(value) => set('targetOrganisations', value)}
          placeholder="Separate with commas"
          value={draft.targetOrganisations}
        />
        <CareerField
          error={dateError}
          label="Target date (optional)"
          maxLength={10}
          onChangeText={(value) => {
            set('targetDate', value);
            if (dateError) setDateError(undefined);
          }}
          placeholder="YYYY-MM-DD"
          value={draft.targetDate}
        />
        <CareerField
          label="Target timeline, in your own words (optional)"
          onChangeText={(value) => set('targetTimeline', value)}
          placeholder="e.g. within 12 months, no fixed date"
          value={draft.targetTimeline}
        />
      </CareerCard>

      <CareerSectionLabel>Context</CareerSectionLabel>
      <CareerCard>
        <CareerField
          label="Strengths"
          multiline
          onChangeText={(value) => set('strengths', value)}
          placeholder="What do you already do well?"
          value={draft.strengths}
        />
        <CareerField
          label="Growth areas"
          multiline
          onChangeText={(value) => set('growthAreas', value)}
          placeholder="What do you want to improve?"
          value={draft.growthAreas}
        />
        <CareerField
          label="Constraints and commitments"
          multiline
          onChangeText={(value) => set('constraints', value)}
          placeholder="Time, location, caring responsibilities, budget — anything that shapes the plan."
          value={draft.constraints}
        />
      </CareerCard>

      <View style={styles.note}>
        <CareerMuted>
          No readiness percentage is shown here. Progress is expressed through the
          goals and milestones you define, not a universal score.
        </CareerMuted>
      </View>

      <CareerActions>
        <CareerButton label="Save profile" onPress={save} />
        <CareerButton label="Cancel" onPress={onBack} variant="secondary" />
      </CareerActions>
    </CareerScreen>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    note: {
      paddingHorizontal: 4,
      paddingVertical: 6,
      borderLeftWidth: 2,
      borderLeftColor: t.colors.border,
      paddingLeft: 10,
    },
  });
