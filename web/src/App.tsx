import { useState, useEffect, type FormEvent } from 'react';

type QuizOption = {
	id: string;
	text: string;
};

type QuizQuestion = {
	id: string;
	question: string;
	options: QuizOption[];
};

type QuizSession = {
	diffHash: string;
};

type SubmitResult = {
	passed: boolean;
	explanations: Record<string, string>;
};

function SiteLogo() {
	return <img className="site-logo" src="/logo.svg" alt="" width={40} height={40} aria-hidden={true} />;
}

function AppFrame({ children, showHeader = true }: { children: React.ReactNode; showHeader?: boolean }) {
	return (
		<>
			<SiteLogo />
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
	question: QuizQuestion;
	value: string;
	error?: string;
	onChange: (newValue: string) => void;
}) {
	return (
		<div className="question">
			<p className="question-prompt">{question.question}</p>
			<div className="options">
				{question.options.map((opt) => {
					const optionId = opt.id ?? '';
					const isSelected = value === optionId;
					return (
						<label key={optionId || opt.text} className={`option ${isSelected ? 'is-selected' : ''}`}>
							<input
								type="radio"
								name={question.id}
								value={optionId}
								checked={isSelected}
								onChange={() => onChange(optionId)}
							/>
							<span className="option-text">{opt.text}</span>
						</label>
					);
				})}
			</div>
			{error && <p className="question-error">{error}</p>}
		</div>
	);
}

export default function App() {
	const [session, setSession] = useState<QuizSession | null>(null);
	const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [passed, setPassed] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		fetch('/session.json')
			.then((response) => response.json())
			.then((sessionPayload: QuizSession) => {
				setSession(sessionPayload);
				return fetch('/quiz');
			})
			.then((response) => response.json())
			.then((quizPayload: { questions: QuizQuestion[] }) => {
				setQuestions(quizPayload.questions);
				setAnswers(Object.fromEntries(quizPayload.questions.map((q) => [q.id, ''])));
			});
	}, []);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		if (!session || !questions) return;

		setSubmitting(true);
		setErrors({});

		const res = await fetch('/submit', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ diffHash: session.diffHash, answers }),
		});

		const result: SubmitResult = await res.json();
		if (result.passed) {
			setPassed(true);
		} else {
			setErrors(result.explanations);
		}

		setSubmitting(false);
	}

	if (!session) {
		return (
			<AppFrame showHeader={false}>
				<p className="loading">loading…</p>
			</AppFrame>
		);
	}

	if (!questions) {
		return (
			<AppFrame showHeader={false}>
				<p className="loading">Generating quiz…</p>
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
						onChange={(optKey) => setAnswers((prev) => ({ ...prev, [q.id]: optKey }))}
					/>
				))}

				<div className="actions">
					<button type="submit" className="submit-btn" disabled={submitting}>
						{submitting ? 'checking…' : 'submit'}
					</button>
				</div>

				{Object.keys(errors).length > 0 && (
					<div className="result result-fail">Some answers need more detail. Try again.</div>
				)}
			</form>
		</AppFrame>
	);
}
