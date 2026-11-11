import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import type { QuizQuestion } from 'qwizz-shared';

type PublicQuestion = Omit<QuizQuestion, 'correctOptionId'>;

/** Renders `backtick` spans as <code>. Captured groups land at odd indices after split. */
function renderInlineCode(text: string): ReactNode[] {
	return text.split(/`([^`]+)`/g).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

function AppFrame({ children, showHeader = true }: { children: ReactNode; showHeader?: boolean }) {
	return (
		<>
			<img className="site-logo" src="/logo.svg" alt="" />
			<div className="backdrop">
				<div className="container">
					{showHeader && (
						<div className="header">
							<h1>qwizz</h1>
						</div>
					)}
					{children}
				</div>
			</div>
		</>
	);
}

function QuestionCard({
	question,
	value,
	error,
	onChange,
}: {
	question: PublicQuestion;
	value: string;
	error?: string;
	onChange: (optionId: string) => void;
}) {
	return (
		<div className="question">
			<p className="question-prompt">{renderInlineCode(question.question)}</p>
			<div className="options">
				{question.options.map((opt) => (
					<label key={opt.id} className={`option ${value === opt.id ? 'is-selected' : ''}`}>
						<input
							type="radio"
							name={question.id}
							value={opt.id}
							checked={value === opt.id}
							onChange={() => onChange(opt.id)}
						/>
						<span className="option-text">{renderInlineCode(opt.text)}</span>
					</label>
				))}
			</div>
			{error && <p className="question-error">{error}</p>}
		</div>
	);
}

export default function App() {
	const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [loadError, setLoadError] = useState<string | null>(null);
	const [passed, setPassed] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		fetch('/quiz')
			.then((res) => res.json())
			.then((payload: { questions?: PublicQuestion[]; error?: string }) => {
				if (!payload.questions) throw new Error(payload.error);
				setQuestions(payload.questions);
			})
			.catch((error: Error) => setLoadError(error.message || 'Could not load the quiz.'));
	}, []);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setErrors({});
		try {
			const res = await fetch('/submit', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ answers }),
			});
			const result: { passed: boolean; errors: Record<string, string> } = await res.json();
			if (result.passed) {
				setPassed(true);
			} else {
				setErrors(result.errors);
			}
		} finally {
			setSubmitting(false);
		}
	}

	if (loadError) {
		return (
			<AppFrame>
				<div className="result result-fail">Could not generate a quiz: {loadError}</div>
			</AppFrame>
		);
	}

	if (!questions) {
		return (
			<AppFrame showHeader={false}>
				<p className="loading">
					Generating quiz
					<span className="loading-dots" aria-hidden="true">
						<span>.</span>
						<span>.</span>
						<span>.</span>
					</span>
				</p>
			</AppFrame>
		);
	}

	if (passed) {
		return (
			<AppFrame>
				<div className="result result-pass">Passed — commit approved. You can close this tab.</div>
			</AppFrame>
		);
	}

	return (
		<AppFrame>
			<form onSubmit={handleSubmit}>
				{questions.map((q) => (
					<QuestionCard
						key={q.id}
						question={q}
						value={answers[q.id] ?? ''}
						error={errors[q.id]}
						onChange={(optionId) => setAnswers((prev) => ({ ...prev, [q.id]: optionId }))}
					/>
				))}

				<div className="actions">
					<button type="submit" className="submit-btn" disabled={submitting}>
						{submitting ? 'checking…' : 'submit'}
					</button>
				</div>

				{Object.keys(errors).length > 0 && (
					<div className="result result-fail">Some answers are incorrect. Try again.</div>
				)}
			</form>
		</AppFrame>
	);
}
