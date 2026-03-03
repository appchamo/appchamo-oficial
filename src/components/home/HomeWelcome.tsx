interface HomeWelcomeProps {
  userName: string;
  section?: { title?: string; subtitle?: string };
}

/** Subtítulo compacto: o "Bem-vindo, Nome" está no Header, aqui só a frase abaixo. */
const HomeWelcome = ({ section }: HomeWelcomeProps) => {
  const subtitle = section?.subtitle || "Encontre o profissional ideal perto de você";

  return (
    <p className="text-sm text-muted-foreground mt-3">{subtitle}</p>
  );
};

export default HomeWelcome;
