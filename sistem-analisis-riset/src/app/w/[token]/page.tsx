import { InterviewForm } from "@/components/InterviewForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export default async function PublicInterviewPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="shell" style={{ maxWidth: 760 }}>
      <InterviewForm token={token} />
      <p className="footer-note">
        Penelitian tesis: asimetri informasi pendapatan suami dalam penetapan nafkah
        pasca-perceraian di PA Sambas. Jangan bagikan tautan ini kepada pihak lain.
      </p>
    </div>
  );
}
